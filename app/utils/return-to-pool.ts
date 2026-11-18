// S-13 (D-09, W5; issue #235): which RentalAgreement, if any, the Asset card
// offers to return to the pool. Presentation only — whether it may happen
// today (X+1) is the server's refusal (AssetNotYetReturnableError), never
// a date the browser computes (D-51).
export interface ReturnToPoolAgreementView {
  id: number
  handoverInAt: string | null
  settlementCompletedAt: string | null
  returnedToPoolAt: string | null
  declaredLostAt: string | null
}

// The history is oldest-first, so only the latest agreement can be the one
// that left the Asset UnderInspection.
export function returnToPoolCandidate(
  assetStatus: string,
  agreements: ReturnToPoolAgreementView[],
): ReturnToPoolAgreementView | null {
  if (assetStatus !== 'under_inspection') return null
  const last = agreements[agreements.length - 1]
  if (!last) return null
  if (!last.handoverInAt || !last.settlementCompletedAt) return null
  if (last.returnedToPoolAt || last.declaredLostAt) return null
  return last
}
