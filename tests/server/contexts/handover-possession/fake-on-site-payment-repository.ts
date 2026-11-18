// In-memory OnSitePaymentRepository (D-65). Filters by tenantId exactly
// like the real queries' `where tenant_id = ...` (FR-33).
import type { TenantId } from '../../../../server/contexts/_shared'
import type {
  OnSitePayment,
  OnSitePaymentRepository,
} from '../../../../server/contexts/handover-possession/on-site-payment'

export function createFakeOnSitePaymentRepository(): OnSitePaymentRepository & {
  all: () => OnSitePayment[]
} {
  const rows: OnSitePayment[] = []
  let nextId = 1
  return {
    async insertOnSitePayment(tenantId: TenantId, params) {
      if (
        params.supersedesId !== null &&
        rows.some((r) => r.supersedesId === params.supersedesId)
      ) {
        throw new Error('fake: on_site_payments_supersedes_once')
      }
      const row: OnSitePayment = { id: nextId++, tenantId, attestedAt: new Date(), ...params }
      rows.push(row)
      return { ...row }
    },
    async listOnSitePaymentsForGroup(tenantId, reservationGroupId) {
      return rows
        .filter((r) => r.tenantId === tenantId && r.reservationGroupId === reservationGroupId)
        .map((r) => ({ ...r }))
    },
    all: () => rows.map((r) => ({ ...r })),
  }
}
