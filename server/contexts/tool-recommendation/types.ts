// Tool recommendation (D-64; issue #214): its own vocabulary. A Visitor
// describes a job; the result is at most three published AssetType ids,
// each with a one-sentence reason, and an optional safety note. Never a
// how-to, never availability (D-58).
import type { TenantId } from '../_shared'

// One published AssetType as the model sees it. Assembled by the
// composition root from Catalog's published interface — this context
// imports no other context.
export interface CatalogEntry {
  id: number
  name: string
  description: string
  powerSource: string | null
  useAreas: string[]
}

export interface Recommendation {
  assetTypeId: number
  reason: string
}

export interface RecommendationResult {
  recommendations: Recommendation[]
  safetyNote: string | null
}

// The provider's billing units for one call.
export interface ProviderUsage {
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
}

// What the provider bills, in millionths of its currency (D-21). The
// provider bills in US dollars, which the shared MonetaryAmount (EUR only)
// does not carry, so the cost keeps its own currency tag.
export interface ProviderCost {
  microUnits: number
  currency: 'USD'
}

// Price per million tokens, in the provider's currency.
export interface ModelPrice {
  inputPerMTok: number
  outputPerMTok: number
  cacheWritePerMTok: number
  cacheReadPerMTok: number
}

export interface VisitorQuestion {
  id: number
  tenantId: TenantId
  questionText: string
  recommendedAssetTypeIds: number[]
  recordedAt: Date
}

export class ToolRecommendationError extends Error {}

export class RecommendationQuestionInvalidError extends ToolRecommendationError {
  constructor() {
    super('The question must be between 1 and 500 characters.')
  }
}

export class VisitorLimitReachedError extends ToolRecommendationError {
  constructor(public readonly window: 'hour' | 'day') {
    super(`The visitor has reached the ${window} limit for recommendations.`)
  }
}

export class MonthlyCapReachedError extends ToolRecommendationError {
  constructor() {
    super("The Tenant's monthly spend cap for recommendations is reached.")
  }
}

// The provider is not configured, unreachable or answered with an error.
// Nothing is recorded: there is no usage to account for.
export class RecommendationUnavailableError extends ToolRecommendationError {
  constructor(detail: string) {
    super(`Recommendations are unavailable: ${detail}`)
  }
}

export class InvalidRecommendationCapError extends ToolRecommendationError {
  constructor() {
    super('The monthly cap must be a whole number of cents between 0 and 100000.')
  }
}
