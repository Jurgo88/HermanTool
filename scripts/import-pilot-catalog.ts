// WP-7.5 (D-60, FR-25, FR-34; issue #154). One-shot import of the
// reviewed pilot catalog into the database named by NUXT_DATABASE_URL.
//
//   pnpm catalog:import --operator <owner's operator uuid>            # dry run
//   pnpm catalog:import --operator <uuid> --apply [--publish]       # write
//
// Dry run is the default and writes nothing. Every write is attributed to
// the given Operator (FR-34) — there is no system actor — and the
// Operator must belong to the seeded Tenant. Prices in the CSV are the
// provisional tiers of D-60 (OQ #29, #159): confirm them in S-19.
import { existsSync } from 'node:fs'
import { createDatabaseClient } from '../server/utils/db'
import { getSeededTenantId } from '../server/utils/tenant'
import { CATALOG_IMAGE_FILES } from '../server/utils/catalog-image-manifest'
import { createPostgresCatalogRepository } from '../server/contexts/catalog'
import { createPostgresAssetRegistryRepository } from '../server/contexts/asset-registry'
import { readPilotCatalog } from './lib/pilot-catalog-csv'
import { applyPilotImport, planPilotImport, readExistingCatalog } from './lib/pilot-import'

const CSV = 'docs/catalog-source/pilot-catalog.csv'

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const operatorId = arg('--operator')
  const apply = process.argv.includes('--apply')
  const publish = process.argv.includes('--publish')
  if (!operatorId) throw new Error('Pass --operator <uuid> (the owner, FR-34).')

  if (!process.env.NUXT_DATABASE_URL && existsSync('.env')) process.loadEnvFile('.env')
  const databaseUrl = process.env.NUXT_DATABASE_URL
  if (!databaseUrl) throw new Error('NUXT_DATABASE_URL is not set.')
  console.log(
    `Database: ${new URL(databaseUrl).host}${apply ? '' : '  (dry run — nothing is written)'}`,
  )

  const sql = createDatabaseClient(databaseUrl)
  try {
    const tenantId = await getSeededTenantId(sql)
    const [operator] = await sql<{ id: string; tenant_id: string; display_name: string }[]>`
      select id, tenant_id, display_name from operators where id = ${operatorId}
    `
    if (!operator) throw new Error(`No Operator ${operatorId}.`)
    if (operator.tenant_id !== tenantId)
      throw new Error(`Operator ${operatorId} is not in the seeded Tenant.`)
    console.log(`Attributed to: ${operator.display_name}`)

    const rows = readPilotCatalog(CSV)
    const catalog = createPostgresCatalogRepository(sql)
    const plan = planPilotImport(rows, await readExistingCatalog(catalog, tenantId))

    console.log(`PowerSources to create: ${plan.powerSources.join(', ') || '—'}`)
    console.log(`UseAreas to create: ${plan.useAreas.join(', ') || '—'}`)
    console.log(
      `AssetTypes to create: ${plan.assetTypes.length} (${plan.assetTypes.reduce((n, r) => n + r.quantity, 0)} Assets)`,
    )
    console.log(`Already present, skipped: ${plan.skipped.length}`)
    for (const row of plan.assetTypes) {
      const accessory = row.principalKey ? `  [Accessory of ${row.principalKey}]` : ''
      console.log(
        `  + ${row.name} × ${row.quantity}  ${row.dayRateEuros} €/deň, záloha ${row.depositEuros} €${accessory}`,
      )
    }

    if (!apply) {
      console.log('\nDry run. Re-run with --apply to write.')
      return
    }

    const result = await applyPilotImport(
      { catalog, assetRegistry: createPostgresAssetRegistryRepository(sql) },
      { tenantId, operatorId, rows, plan, shippedImages: CATALOG_IMAGE_FILES, publish },
    )
    console.log(
      `\nCreated ${result.createdAssetTypes} AssetTypes and registered ${result.registeredAssets} Assets.`,
    )
    console.log('Assets stay pending activation until tagged and marked Rentable (S-20).')
    if (!publish)
      console.log(
        'AssetTypes are unpublished: publish them in S-19 (re-running the import skips them).',
      )
  } finally {
    await sql.end()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
