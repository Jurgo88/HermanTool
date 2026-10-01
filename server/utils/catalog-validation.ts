// Zod schemas for the Catalog admin surface's HTTP boundary (FR-37).
// Validation happens here, not in Vue components (D-25) — this module
// is imported only by server/api/catalog/* route handlers.
import { z } from 'zod'

// D-21: EUR only in the pilot — the currency travels on every amount as
// an invariant, not a convention, so a request naming any other
// currency is a validation error, not a silent coercion.
const monetaryAmountSchema = z.object({
  amount: z.number().int().nonnegative(),
  currency: z.literal('EUR'),
})

const idSchema = z.number().int().positive()

// D-54, D-55, D-56. Shape only; trimming, emptiness and cross-Tenant
// references are domain rules (./contexts/catalog/asset-type.ts).
const assetTypeContentSchema = z.object({
  powerSourceId: idSchema.nullable().optional(),
  useAreaIds: z.array(idSchema).optional(),
  specifications: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  includedContents: z.string().optional(),
  handlingNotice: z.string().optional(),
  imageFile: z.string().nullable().optional(),
  principalIds: z.array(idSchema).optional(),
})

export const createAssetTypeBodySchema = assetTypeContentSchema.extend({
  name: z.string(),
  description: z.string(),
  dayRate: monetaryAmountSchema,
  depositAmount: monetaryAmountSchema,
})

export const updateAssetTypeBodySchema = assetTypeContentSchema.extend({
  name: z.string().optional(),
  description: z.string().optional(),
  dayRate: monetaryAmountSchema.optional(),
  depositAmount: monetaryAmountSchema.optional(),
})

export const classificationLabelBodySchema = z.object({
  label: z.string(),
})

export const classificationReorderBodySchema = z.object({
  sequence: z.array(idSchema),
})
