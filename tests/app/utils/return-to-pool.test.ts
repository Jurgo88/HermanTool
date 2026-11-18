import { describe, expect, it } from 'vitest'
import {
  returnToPoolCandidate,
  type ReturnToPoolAgreementView,
} from '../../../app/utils/return-to-pool'

// S-13 (D-09, issue #235): the Asset card offers "return to the pool" only
// for a handed-in, settled agreement that has not been returned yet.
function agreement(overrides: Partial<ReturnToPoolAgreementView> = {}): ReturnToPoolAgreementView {
  return {
    id: 7,
    handoverInAt: '2026-11-20T09:00:00.000Z',
    settlementCompletedAt: '2026-11-20T09:05:00.000Z',
    returnedToPoolAt: null,
    declaredLostAt: null,
    ...overrides,
  }
}

describe('returnToPoolCandidate', () => {
  it('offers the latest settled agreement of an Asset under inspection', () => {
    expect(
      returnToPoolCandidate('under_inspection', [
        agreement({ id: 3, returnedToPoolAt: 'x' }),
        agreement(),
      ]),
    ).toMatchObject({ id: 7 })
  })

  it('offers nothing unless the Asset is under inspection', () => {
    for (const status of ['rentable', 'in_possession', 'unavailable', 'retired']) {
      expect(returnToPoolCandidate(status, [agreement()])).toBeNull()
    }
  })

  it('offers nothing before Settlement completes', () => {
    expect(
      returnToPoolCandidate('under_inspection', [agreement({ settlementCompletedAt: null })]),
    ).toBeNull()
  })

  it('offers nothing before HandoverIn', () => {
    expect(
      returnToPoolCandidate('under_inspection', [agreement({ handoverInAt: null })]),
    ).toBeNull()
  })

  it('offers nothing once returned to the pool or declared lost', () => {
    expect(
      returnToPoolCandidate('under_inspection', [agreement({ returnedToPoolAt: 'x' })]),
    ).toBeNull()
    expect(
      returnToPoolCandidate('under_inspection', [agreement({ declaredLostAt: 'x' })]),
    ).toBeNull()
  })

  it('offers nothing with no history', () => {
    expect(returnToPoolCandidate('under_inspection', [])).toBeNull()
  })
})
