// In-memory stand-in for HandoverPossessionRepository, used by
// scan-resolution.test.ts, handover-out.test.ts and handover-in.test.ts
// so the domain logic in
// server/contexts/handover-possession/{scan-resolution,handover-out,handover-in}.ts
// is exercised without a database (Part 4 §14.2), mirroring every other
// context's fake-repository.ts.
//
// Takes a FakeAssetRegistryRepository as a constructor parameter rather
// than creating its own — transaction() must hand callers the SAME
// Asset Registry fake a test already seeded Assets/AssetTags into,
// mirroring the real repository's composition of a transaction-bound
// AssetRegistryRepository (see ../../../../server/contexts/handover-possession/repository.ts).
import type { AssetRegistryRepository } from '../../../../server/contexts/asset-registry'
import type { TenantId } from '../../../../server/contexts/_shared'
import type {
  HandoverPossessionRepository,
  NewConditionReport,
  NewDepositReturned,
  NewDepositTaken,
  NewRentalAgreement,
  NewScanEvent,
  SetHandoverInParams,
} from '../../../../server/contexts/handover-possession/repository'
import type {
  ConditionReport,
  DepositReturned,
  DepositTaken,
  RentalAgreement,
  ScanEvent,
} from '../../../../server/contexts/handover-possession/types'

interface State {
  scanEvents: ScanEvent[]
  rentalAgreements: RentalAgreement[]
  conditionReports: ConditionReport[]
  depositsTaken: DepositTaken[]
  depositsReturned: DepositReturned[]
  nextScanEventId: number
  nextRentalAgreementId: number
  nextConditionReportId: number
  nextDepositTakenId: number
  nextDepositReturnedId: number
}

export interface FakeHandoverPossessionRepository extends HandoverPossessionRepository {
  allScanEvents(): ScanEvent[]
  allRentalAgreements(): RentalAgreement[]
  allConditionReports(): ConditionReport[]
  allDepositsTaken(): DepositTaken[]
  allDepositsReturned(): DepositReturned[]
}

export function createFakeHandoverPossessionRepository(
  assetRegistryRepo: AssetRegistryRepository,
): FakeHandoverPossessionRepository {
  const state: State = {
    scanEvents: [],
    rentalAgreements: [],
    conditionReports: [],
    depositsTaken: [],
    depositsReturned: [],
    nextScanEventId: 1,
    nextRentalAgreementId: 1,
    nextConditionReportId: 1,
    nextDepositTakenId: 1,
    nextDepositReturnedId: 1,
  }

  function build(): FakeHandoverPossessionRepository {
    return {
      allScanEvents() {
        return state.scanEvents.map((e) => ({ ...e }))
      },
      allRentalAgreements() {
        return state.rentalAgreements.map((a) => ({ ...a }))
      },
      allConditionReports() {
        return state.conditionReports.map((r) => ({ ...r }))
      },
      allDepositsTaken() {
        return state.depositsTaken.map((d) => ({ ...d }))
      },
      allDepositsReturned() {
        return state.depositsReturned.map((d) => ({ ...d }))
      },

      async insertScanEvent(tenantId: TenantId, { assetId, operatorId }: NewScanEvent) {
        const scanEvent: ScanEvent = { id: state.nextScanEventId++, tenantId, assetId, operatorId, occurredAt: new Date() }
        state.scanEvents.push(scanEvent)
        return { ...scanEvent }
      },

      async insertRentalAgreement(
        tenantId: TenantId,
        {
          reservationId,
          customerId,
          assetId,
          operatorId,
          termsVersion,
          handoverOutAt,
          handoverOutRecordedAt,
          handoverOutBackdateReason,
        }: NewRentalAgreement,
      ) {
        const agreement: RentalAgreement = {
          id: state.nextRentalAgreementId++,
          tenantId,
          reservationId,
          customerId,
          assetId,
          operatorId,
          termsVersion,
          handoverOutAt,
          handoverOutRecordedAt,
          handoverOutBackdateReason,
          handoverInAt: null,
          handoverInRecordedAt: null,
          handoverInBackdateReason: null,
          settlementCompletedAt: null,
          returnedToPoolAt: null,
        }
        state.rentalAgreements.push(agreement)
        return { ...agreement }
      },

      async getRentalAgreement(tenantId, id) {
        const agreement = state.rentalAgreements.find((a) => a.tenantId === tenantId && a.id === id)
        return agreement ? { ...agreement } : null
      },

      async getOpenRentalAgreementForAsset(tenantId, assetId) {
        const agreement = [...state.rentalAgreements]
          .reverse()
          .find((a) => a.tenantId === tenantId && a.assetId === assetId && a.handoverInAt === null)
        return agreement ? { ...agreement } : null
      },

      async getRentalAgreementByReservation(tenantId, reservationId) {
        const agreement = state.rentalAgreements.find(
          (a) => a.tenantId === tenantId && a.reservationId === reservationId,
        )
        return agreement ? { ...agreement } : null
      },

      async listRentalAgreementsForAsset(tenantId, assetId) {
        return state.rentalAgreements
          .filter((a) => a.tenantId === tenantId && a.assetId === assetId)
          .sort((a, b) => a.handoverOutAt.getTime() - b.handoverOutAt.getTime())
          .map((a) => ({ ...a }))
      },

      async setHandoverInAt(
        tenantId,
        rentalAgreementId,
        { handoverInAt, handoverInRecordedAt, handoverInBackdateReason }: SetHandoverInParams,
      ) {
        const agreement = state.rentalAgreements.find(
          (a) => a.tenantId === tenantId && a.id === rentalAgreementId && a.handoverInAt === null,
        )
        if (!agreement) return null
        agreement.handoverInAt = handoverInAt
        agreement.handoverInRecordedAt = handoverInRecordedAt
        agreement.handoverInBackdateReason = handoverInBackdateReason
        return { ...agreement }
      },

      async setSettlementCompletedAt(tenantId, rentalAgreementId, at) {
        const agreement = state.rentalAgreements.find(
          (a) => a.tenantId === tenantId && a.id === rentalAgreementId && a.settlementCompletedAt === null,
        )
        if (!agreement) return null
        agreement.settlementCompletedAt = at
        return { ...agreement }
      },

      async markReturnedToPool(tenantId, rentalAgreementId, at) {
        const agreement = state.rentalAgreements.find(
          (a) => a.tenantId === tenantId && a.id === rentalAgreementId && a.returnedToPoolAt === null,
        )
        if (!agreement) return null
        agreement.returnedToPoolAt = at
        return { ...agreement }
      },

      async insertConditionReport(
        tenantId: TenantId,
        { rentalAgreementId, stage, photoObjectKeys, operatorId, capturedAt, recordedAt }: NewConditionReport,
      ) {
        const report: ConditionReport = {
          id: state.nextConditionReportId++,
          tenantId,
          rentalAgreementId,
          stage,
          photoObjectKeys: [...photoObjectKeys],
          operatorId,
          capturedAt,
          recordedAt,
        }
        state.conditionReports.push(report)
        return { ...report }
      },

      async listConditionReportsForAgreement(tenantId, rentalAgreementId) {
        return state.conditionReports
          .filter((r) => r.tenantId === tenantId && r.rentalAgreementId === rentalAgreementId)
          .map((r) => ({ ...r }))
      },

      async insertDepositTaken(
        tenantId: TenantId,
        { rentalAgreementId, amount, operatorId, takenAt, recordedAt }: NewDepositTaken,
      ) {
        const deposit: DepositTaken = {
          id: state.nextDepositTakenId++,
          tenantId,
          rentalAgreementId,
          amount: { ...amount },
          operatorId,
          takenAt,
          recordedAt,
        }
        state.depositsTaken.push(deposit)
        return { ...deposit }
      },

      async getDepositTakenForAgreement(tenantId, rentalAgreementId) {
        const deposit = state.depositsTaken.find(
          (d) => d.tenantId === tenantId && d.rentalAgreementId === rentalAgreementId,
        )
        return deposit ? { ...deposit } : null
      },

      async insertDepositReturned(
        tenantId: TenantId,
        { rentalAgreementId, amount, deductionReason, operatorId, returnedAt, recordedAt }: NewDepositReturned,
      ) {
        const deposit: DepositReturned = {
          id: state.nextDepositReturnedId++,
          tenantId,
          rentalAgreementId,
          amount: { ...amount },
          deductionReason,
          operatorId,
          returnedAt,
          recordedAt,
        }
        state.depositsReturned.push(deposit)
        return { ...deposit }
      },

      async getDepositReturnedForAgreement(tenantId, rentalAgreementId) {
        const deposit = state.depositsReturned.find(
          (d) => d.tenantId === tenantId && d.rentalAgreementId === rentalAgreementId,
        )
        return deposit ? { ...deposit } : null
      },

      async listSettledRentalAgreementsPendingPoolReturn(tenantId) {
        return state.rentalAgreements
          .filter((a) => a.tenantId === tenantId && a.settlementCompletedAt !== null && a.returnedToPoolAt === null)
          .map((a) => ({ ...a }))
      },

      async transaction(fn) {
        return fn(build(), assetRegistryRepo)
      },
    }
  }

  return build()
}
