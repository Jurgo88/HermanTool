// In-memory stand-in for HandoverPossessionRepository, used by
// scan-resolution.test.ts and handover-out.test.ts so the domain logic
// in server/contexts/handover-possession/{scan-resolution,handover-out}.ts
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
  NewDepositTaken,
  NewRentalAgreement,
  NewScanEvent,
} from '../../../../server/contexts/handover-possession/repository'
import type {
  ConditionReport,
  DepositTaken,
  RentalAgreement,
  ScanEvent,
} from '../../../../server/contexts/handover-possession/types'

interface State {
  scanEvents: ScanEvent[]
  rentalAgreements: RentalAgreement[]
  conditionReports: ConditionReport[]
  depositsTaken: DepositTaken[]
  nextScanEventId: number
  nextRentalAgreementId: number
  nextConditionReportId: number
  nextDepositTakenId: number
}

export interface FakeHandoverPossessionRepository extends HandoverPossessionRepository {
  allScanEvents(): ScanEvent[]
  allRentalAgreements(): RentalAgreement[]
  allConditionReports(): ConditionReport[]
  allDepositsTaken(): DepositTaken[]
}

export function createFakeHandoverPossessionRepository(
  assetRegistryRepo: AssetRegistryRepository,
): FakeHandoverPossessionRepository {
  const state: State = {
    scanEvents: [],
    rentalAgreements: [],
    conditionReports: [],
    depositsTaken: [],
    nextScanEventId: 1,
    nextRentalAgreementId: 1,
    nextConditionReportId: 1,
    nextDepositTakenId: 1,
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

      async insertScanEvent(tenantId: TenantId, { assetId, operatorId }: NewScanEvent) {
        const scanEvent: ScanEvent = { id: state.nextScanEventId++, tenantId, assetId, operatorId, occurredAt: new Date() }
        state.scanEvents.push(scanEvent)
        return { ...scanEvent }
      },

      async insertRentalAgreement(
        tenantId: TenantId,
        { reservationId, customerId, assetId, operatorId, termsVersion }: NewRentalAgreement,
      ) {
        const agreement: RentalAgreement = {
          id: state.nextRentalAgreementId++,
          tenantId,
          reservationId,
          customerId,
          assetId,
          operatorId,
          termsVersion,
          handoverOutAt: new Date(),
          handoverInAt: null,
        }
        state.rentalAgreements.push(agreement)
        return { ...agreement }
      },

      async getRentalAgreement(tenantId, id) {
        const agreement = state.rentalAgreements.find((a) => a.tenantId === tenantId && a.id === id)
        return agreement ? { ...agreement } : null
      },

      async insertConditionReport(
        tenantId: TenantId,
        { rentalAgreementId, stage, photoObjectKeys, operatorId }: NewConditionReport,
      ) {
        const report: ConditionReport = {
          id: state.nextConditionReportId++,
          tenantId,
          rentalAgreementId,
          stage,
          photoObjectKeys: [...photoObjectKeys],
          operatorId,
          capturedAt: new Date(),
        }
        state.conditionReports.push(report)
        return { ...report }
      },

      async insertDepositTaken(tenantId: TenantId, { rentalAgreementId, amount, operatorId }: NewDepositTaken) {
        const deposit: DepositTaken = {
          id: state.nextDepositTakenId++,
          tenantId,
          rentalAgreementId,
          amount: { ...amount },
          operatorId,
          takenAt: new Date(),
        }
        state.depositsTaken.push(deposit)
        return { ...deposit }
      },

      async transaction(fn) {
        return fn(build(), assetRegistryRepo)
      },
    }
  }

  return build()
}
