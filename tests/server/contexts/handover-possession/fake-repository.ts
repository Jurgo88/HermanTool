// In-memory stand-in for HandoverPossessionRepository, used by
// scan-resolution.test.ts so the domain logic in
// server/contexts/handover-possession/scan-resolution.ts is exercised
// without a database (Part 4 §14.2), mirroring every other context's
// fake-repository.ts.
import type { TenantId } from '../../../../server/contexts/_shared'
import type {
  HandoverPossessionRepository,
  NewScanEvent,
} from '../../../../server/contexts/handover-possession/repository'
import type { ScanEvent } from '../../../../server/contexts/handover-possession/types'

interface State {
  scanEvents: ScanEvent[]
  nextId: number
}

export interface FakeHandoverPossessionRepository extends HandoverPossessionRepository {
  allScanEvents(): ScanEvent[]
}

export function createFakeHandoverPossessionRepository(): FakeHandoverPossessionRepository {
  const state: State = { scanEvents: [], nextId: 1 }

  return {
    allScanEvents() {
      return state.scanEvents.map((e) => ({ ...e }))
    },

    async insertScanEvent(tenantId: TenantId, { assetId, operatorId }: NewScanEvent) {
      const scanEvent: ScanEvent = {
        id: state.nextId++,
        tenantId,
        assetId,
        operatorId,
        occurredAt: new Date(),
      }
      state.scanEvents.push(scanEvent)
      return { ...scanEvent }
    },
  }
}
