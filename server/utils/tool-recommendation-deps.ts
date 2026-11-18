// Tool recommendation's composition root (D-64; #214): the one place that
// joins Catalog's published AssetTypes, Availability & Reservation's time
// zone, the Tenant's cap and the provider gateway. The context itself
// imports none of them (D-02).
import { createError, getHeader, getRequestIP, type H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import { TENANT_TIME_ZONE } from '../contexts/availability-reservation'
import { listBrowsableAssetTypes, listClassification, type CatalogRepository } from '../contexts/catalog'
import type { TenantId } from '../contexts/_shared'
import {
  InvalidRecommendationCapError,
  MonthlyCapReachedError,
  RecommendationQuestionInvalidError,
  RecommendationUnavailableError,
  VisitorLimitReachedError,
  createAnthropicRecommendationGateway,
  createPostgresToolRecommendationRepository,
  type CatalogEntry,
} from '../contexts/tool-recommendation'
import { getSharedDatabaseClient } from './db'

export { TENANT_TIME_ZONE }

export function createToolRecommendationDeps(event: H3Event) {
  const config = useRuntimeConfig(event)
  const sql = getSharedDatabaseClient(config.databaseUrl)
  const model = String(config.toolRecommendationModel ?? '')
  const apiKey = String(config.anthropicApiKey ?? '')
  return {
    sql,
    repo: createPostgresToolRecommendationRepository(sql),
    gateway: createAnthropicRecommendationGateway({ apiKey, model }),
    model,
    configured: apiKey !== '' && model !== '',
  }
}

// The Tenant's published, standalone AssetTypes (D-57: never an Accessory)
// with their PowerSource and UseArea labels — what the model chooses from.
export async function buildRecommendationCatalog(
  catalogRepo: CatalogRepository,
  tenantId: TenantId,
): Promise<{ entries: CatalogEntry[]; byId: Map<number, Awaited<ReturnType<typeof listBrowsableAssetTypes>>[number]> }> {
  const [assetTypes, powerSources, useAreas] = await Promise.all([
    listBrowsableAssetTypes(catalogRepo, { tenantId }),
    listClassification(catalogRepo, { tenantId, kind: 'powerSource' }),
    listClassification(catalogRepo, { tenantId, kind: 'useArea' }),
  ])
  const powerLabel = new Map(powerSources.map((entry) => [entry.id, entry.label]))
  const useLabel = new Map(useAreas.map((entry) => [entry.id, entry.label]))
  return {
    entries: assetTypes.map((assetType) => ({
      id: assetType.id,
      name: assetType.name,
      description: assetType.description,
      powerSource: assetType.powerSourceId === null ? null : (powerLabel.get(assetType.powerSourceId) ?? null),
      useAreas: assetType.useAreaIds.map((id) => useLabel.get(id)).filter((label): label is string => !!label),
    })),
    byId: new Map(assetTypes.map((assetType) => [assetType.id, assetType])),
  }
}

// The Visitor's IP, used only to derive the day's HMAC key and never
// stored. Netlify puts the client address in its own header; elsewhere the
// socket address. A request with neither shares one "unknown" bucket.
export function visitorIpOf(event: H3Event): string {
  return getHeader(event, 'x-nf-client-connection-ip') ?? getRequestIP(event) ?? 'unknown'
}

export function utcDayOf(now: Date): string {
  return now.toISOString().slice(0, 10)
}

export function translateToolRecommendationError(err: unknown): never {
  const reply = (statusCode: number, e: Error, extra: Record<string, unknown> = {}) =>
    createError({ statusCode, statusMessage: e.message, data: { code: e.constructor.name, ...extra } })
  if (err instanceof RecommendationQuestionInvalidError || err instanceof InvalidRecommendationCapError) {
    throw reply(400, err)
  }
  if (err instanceof VisitorLimitReachedError) throw reply(429, err, { window: err.window })
  if (err instanceof MonthlyCapReachedError || err instanceof RecommendationUnavailableError) {
    throw reply(503, err)
  }
  throw err
}
