// Tool recommendation — D-64 (issue #214). A Visitor describes a job on
// S-01 and gets at most three published AssetTypes. Opens no Part 1
// subdomain: it is a read of the published catalog plus a bounded Visitor
// record, stated as an exception to Part 2 in D-64.
//
// Dependency direction: imports no other context. The composition root
// passes in the Tenant's published catalog (Catalog) and the Tenant's
// time zone (Availability & Reservation).
export type {
  CatalogEntry,
  ModelPrice,
  ProviderCost,
  ProviderUsage,
  Recommendation,
  RecommendationResult,
  VisitorQuestion,
} from './types'
export {
  InvalidRecommendationCapError,
  MonthlyCapReachedError,
  RecommendationQuestionInvalidError,
  RecommendationUnavailableError,
  ToolRecommendationError,
  VisitorLimitReachedError,
} from './types'
export type { ToolRecommendationRepository } from './repository'
export { createPostgresToolRecommendationRepository } from './repository'
export type {
  RawRecommendationOutput,
  RecommendationModelGateway,
  RecommendationModelRequest,
  RecommendationModelResponse,
} from './model-gateway'
export { createAnthropicRecommendationGateway } from './model-gateway'
export {
  DEFAULT_MONTHLY_CAP,
  MAX_QUESTION_LENGTH,
  MAX_RECOMMENDATIONS,
  QUESTION_RETENTION_DAYS,
  VISITOR_DAILY_LIMIT,
  VISITOR_HOURLY_LIMIT,
  assertValidRecommendationCap,
  computeProviderCost,
  isCapReached,
  isRecommendationAvailable,
  listRecentVisitorQuestions,
  priceOf,
  purgeExpiredRecommendationRecords,
  recommendTools,
  scrubContactDetails,
} from './recommendation'
