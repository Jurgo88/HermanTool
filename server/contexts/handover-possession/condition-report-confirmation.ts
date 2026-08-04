// ConditionReport upload confirmation (D-40, Part 4 §16.2, issue
// #78/IR-10). Shared by both ./handover-out.ts and ./handover-in.ts,
// which both create ConditionReport rows via the identical
// presigned-URL-then-photo-upload shape — this file is the one place
// that confirms either kind, so completeSettlement's FR-20 check has a
// single definition of "confirmed" to read.
import { MAX_EVIDENCE_UPLOAD_SIZE_BYTES, type TenantId } from '../_shared'
import { UPLOAD_URL_TTL_SECONDS, type ConditionReportStorageGateway } from './r2-gateway'
import type { HandoverPossessionRepository } from './repository'
import { ConditionReportNotFoundError, type ConditionReport } from './types'

// FR-19: "A ConditionReport with photographs is captured at each end of
// every rental" — a report names N object keys, so it counts as
// confirmed only once ALL N are confirmed present. A report claiming 3
// photographs where 1 never uploaded is a false claim, not a partially
// true one, and FR-20 must not count it.
export type ConfirmConditionReportUploadOutcome =
  | { outcome: 'confirmed'; conditionReport: ConditionReport }
  | { outcome: 'not_yet_uploaded'; missingObjectKeys: string[] }
  | { outcome: 'oversized'; objectKey: string; contentLength: number }

export async function confirmConditionReportUpload(
  repo: HandoverPossessionRepository,
  gateway: ConditionReportStorageGateway,
  params: { tenantId: TenantId; conditionReportId: number; now?: Date },
): Promise<ConfirmConditionReportUploadOutcome> {
  const { tenantId, conditionReportId, now = new Date() } = params

  const report = await repo.getConditionReport(tenantId, conditionReportId)
  if (!report) throw new ConditionReportNotFoundError(conditionReportId)

  // Idempotent: a retried confirm call, or the sweep reaching a report
  // the client already confirmed itself, is success, not an error.
  if (report.confirmedAt) return { outcome: 'confirmed', conditionReport: report }

  const stats = await Promise.all(
    report.photoObjectKeys.map(async (objectKey) => ({ objectKey, stat: await gateway.statObject(objectKey) })),
  )

  const missingObjectKeys = stats.filter(({ stat }) => !stat.exists).map(({ objectKey }) => objectKey)
  if (missingObjectKeys.length > 0) return { outcome: 'not_yet_uploaded', missingObjectKeys }

  const oversized = stats.find(
    ({ stat }) => stat.contentLength !== null && stat.contentLength > MAX_EVIDENCE_UPLOAD_SIZE_BYTES,
  )
  if (oversized) {
    // D-40's second, smaller obligation (OQ #26). Only the offending
    // object is deleted — the others may be genuinely fine, and the
    // Operator retakes the one photo, not the whole report.
    await gateway.deleteObject(oversized.objectKey)
    return { outcome: 'oversized', objectKey: oversized.objectKey, contentLength: oversized.stat.contentLength! }
  }

  const confirmed = await repo.confirmConditionReport(tenantId, conditionReportId, now)
  // Unreachable in practice — confirmedAt was just checked null above,
  // and nothing else in this codebase confirms concurrently against the
  // same row — kept as a checked invariant rather than a silent `!`.
  return { outcome: 'confirmed', conditionReport: confirmed ?? report }
}

// D-40: the sweep. A report whose presigned URLs have outlived their own
// lifetime and is still unconfirmed gets one last confirmation attempt
// before being left permanently unconfirmed. Never deleted (P1,
// append-only) — an unconfirmed report simply never satisfies FR-20.
export async function sweepUnconfirmedConditionReports(
  repo: HandoverPossessionRepository,
  gateway: ConditionReportStorageGateway,
  params: { tenantId: TenantId; now?: Date },
): Promise<ConditionReport[]> {
  const { tenantId, now = new Date() } = params
  const cutoff = new Date(now.getTime() - UPLOAD_URL_TTL_SECONDS * 1000)

  const candidates = await repo.listUnconfirmedConditionReportsOlderThan(tenantId, cutoff)
  const confirmed: ConditionReport[] = []

  for (const candidate of candidates) {
    const result = await confirmConditionReportUpload(repo, gateway, {
      tenantId,
      conditionReportId: candidate.id,
      now,
    })
    if (result.outcome === 'confirmed') confirmed.push(result.conditionReport)
  }

  return confirmed
}
