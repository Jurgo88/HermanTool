import {
  createHandoverPossessionDeps,
  getRentalAgreementIdParam,
} from '../../../../utils/handover-possession-deps'
import { requireOperator } from '../../../../utils/operator-session'

// D-49, FR-20: lets the Settlement screen show paired-evidence status
// before a deduction is attempted, instead of only finding out from the
// server's own refusal. Read-only — the FR-20 check itself still lives
// exclusively in completeSettlement (server/contexts/handover-possession/handover-in.ts);
// this route adds no domain logic of its own.
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const rentalAgreementId = getRentalAgreementIdParam(event)
  const { repo, close } = createHandoverPossessionDeps(event)

  try {
    const reports = await repo.listConditionReportsForAgreement(operator.tenantId, rentalAgreementId)
    return reports.map((r) => ({ stage: r.stage, confirmedAt: r.confirmedAt }))
  } finally {
    await close()
  }
})
