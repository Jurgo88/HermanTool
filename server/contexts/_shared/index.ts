// Shared kernel (not a bounded context): cross-context value concepts
// that every context is expected to use identically. Keep this file
// small — anything context-specific belongs inside that context's own
// module, not here.
export type { TenantId } from './tenant'
export type { CurrencyCode, MonetaryAmount } from './monetary-amount'
export { createMonetaryAmount, InvalidMonetaryAmountError } from './monetary-amount'
export { MAX_EVIDENCE_UPLOAD_SIZE_BYTES } from './upload-limits'
