// The `backdate` part of a HandoverOut / HandoverIn request (FR-24, D-10): when
// it really happened, and why it is being recorded late. Shared by both
// routes so they cannot disagree about what a time looks like.
//
// `occurredAt` is either what a counter form types (YYYY-MM-DDTHH:mm, the
// Tenant's wall clock — resolved here, never in the browser, D-51) or an ISO
// instant that names its own offset. A bare ISO time with no offset is
// refused: it would be read in whatever zone the server runs in.
import { z } from 'zod'
import {
  InvalidLocalDateTimeError,
  parseTenantLocalDateTime,
} from '../contexts/availability-reservation'

const LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
const OFFSET_PATTERN = /(Z|[+-]\d{2}:?\d{2})$/

export function parseOccurredAt(value: string): Date | null {
  if (LOCAL_PATTERN.test(value)) {
    try {
      return parseTenantLocalDateTime(value)
    } catch (err) {
      if (err instanceof InvalidLocalDateTimeError) return null
      throw err
    }
  }
  if (!OFFSET_PATTERN.test(value)) return null
  const instant = new Date(value)
  return Number.isNaN(instant.getTime()) ? null : instant
}

export const backdateBodySchema = z.object({
  occurredAt: z.string().transform((value, ctx) => {
    const instant = parseOccurredAt(value)
    if (!instant) {
      ctx.addIssue({ code: 'custom', message: 'occurredAt is not a valid date and time.' })
      return z.NEVER
    }
    return instant
  }),
  reason: z.string().min(1),
})
