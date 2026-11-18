// S-25 statistics (D-63; issue #211): the HTTP boundary's shared pieces —
// the reporting source on the shared connection (D-39), the Zod schema
// for a reporting range, and the error translation.
import { createError, type H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import { z } from 'zod'
import { InvalidReportingRangeError, type ReportingRange } from '../contexts/utilisation-reporting'
import { getSharedDatabaseClient } from './db'
import { createPostgresReportingSource } from './statistics-source'

export function createStatisticsDeps(event: H3Event) {
  const config = useRuntimeConfig(event)
  return { source: createPostgresReportingSource(getSharedDatabaseClient(config.databaseUrl)) }
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const reportingRangeQuerySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('month'), month: z.string().regex(/^\d{4}-\d{2}$/) }),
  z.object({ kind: z.literal('year'), year: z.string().regex(/^\d{4}$/) }),
  z.object({ kind: z.literal('custom'), startDay: day, endDay: day }),
])

export function parseReportingRange(query: unknown): ReportingRange {
  const result = reportingRangeQuerySchema.safeParse(query)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid reporting range.',
      data: { code: 'InvalidReportingRangeError' },
    })
  }
  return result.data
}

export function translateStatisticsError(err: unknown): never {
  if (err instanceof InvalidReportingRangeError) {
    throw createError({
      statusCode: 400,
      statusMessage: err.message,
      data: { code: err.constructor.name },
    })
  }
  throw err
}

// The CSV header row, Slovak, for the accountant. Column meaning is fixed
// by toStatisticsCsv; the words are presentation and live with the route.
export const STATISTICS_CSV_HEADERS = [
  'Od',
  'Do',
  'Náradie',
  'Počet prenájmov',
  'Prenajaté dni',
  'Vyťaženosť %',
  'Tržba',
  'Mena',
  'Dni bez voľného kusu',
] as const
