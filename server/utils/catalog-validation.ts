// Zod schemas for the Catalog admin surface's HTTP boundary (FR-37).
// Validation happens here, not in Vue components (D-25) — this module
// is imported only by server/api/catalog/asset-types/* route handlers.
import { z } from 'zod'

// D-21: EUR only in the pilot — the currency travels on every amount as
// an invariant, not a convention, so a request naming any other
// currency is a validation error, not a silent coercion.
const monetaryAmountSchema = z.object({
  amount: z.number().int().nonnegative(),
  currency: z.literal('EUR'),
})

export const createAssetTypeBodySchema = z.object({
  name: z.string(),
  description: z.string(),
  dayRate: monetaryAmountSchema,
  depositAmount: monetaryAmountSchema,
})

export const updateAssetTypeBodySchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  dayRate: monetaryAmountSchema.optional(),
  depositAmount: monetaryAmountSchema.optional(),
})
