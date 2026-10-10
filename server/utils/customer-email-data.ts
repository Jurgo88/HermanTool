// The data a Customer email needs from Catalog, resolved at the utility layer
// because Notification may not import Catalog (D-02, D-28; #189).
//
// A Customer must never read "AssetType 13". The Operator worklists fall back
// to that kind of placeholder on purpose (a row should not disappear); an
// email cannot, so a missing name becomes plain words instead.
import type { MonetaryAmount, TenantId } from '../contexts/_shared'
import { createMonetaryAmount } from '../contexts/_shared'
import type { CatalogRepository } from '../contexts/catalog'
import { UNNAMED_ASSET_TYPE, type ConfirmationLine } from '../contexts/notification'

interface ReservedPeriod {
  assetTypeId: number
  period: { startDay: string; endDay: string }
}

export async function assetTypeNameForEmail(
  catalogRepo: CatalogRepository,
  tenantId: TenantId,
  assetTypeId: number,
): Promise<string> {
  return (await catalogRepo.getAssetType(tenantId, assetTypeId))?.name ?? UNNAMED_ASSET_TYPE
}

// FR-06: every unit is its own Reservation, so three drills for the same days
// arrive as three. The email says "× 3". Order follows the first appearance.
// The deposit (D-07) is per unit and is only summed within one currency (D-21):
// when a deposit cannot be named, the email says only that it is paid in cash.
export async function buildConfirmationSummary(
  catalogRepo: CatalogRepository,
  tenantId: TenantId,
  reservations: ReservedPeriod[],
): Promise<{ lines: ConfirmationLine[]; depositTotal: MonetaryAmount | null }> {
  const grouped = new Map<string, { assetTypeId: number; startDay: string; endDay: string; quantity: number }>()
  for (const { assetTypeId, period } of reservations) {
    const key = `${assetTypeId}|${period.startDay}|${period.endDay}`
    const existing = grouped.get(key)
    if (existing) existing.quantity += 1
    else grouped.set(key, { assetTypeId, startDay: period.startDay, endDay: period.endDay, quantity: 1 })
  }

  const assetTypes = new Map(
    await Promise.all(
      [...new Set(reservations.map((r) => r.assetTypeId))].map(
        async (id) => [id, await catalogRepo.getAssetType(tenantId, id)] as const,
      ),
    ),
  )

  const lines: ConfirmationLine[] = []
  let depositCents = 0
  let depositKnown = reservations.length > 0
  let currency: MonetaryAmount['currency'] | null = null

  for (const group of grouped.values()) {
    const assetType = assetTypes.get(group.assetTypeId) ?? null
    lines.push({
      assetTypeName: assetType?.name ?? UNNAMED_ASSET_TYPE,
      quantity: group.quantity,
      startDay: group.startDay,
      endDay: group.endDay,
    })

    if (!assetType) {
      depositKnown = false
    } else if (currency !== null && currency !== assetType.depositAmount.currency) {
      depositKnown = false
    } else {
      currency = assetType.depositAmount.currency
      depositCents += assetType.depositAmount.amount * group.quantity
    }
  }

  return {
    lines,
    depositTotal: depositKnown && currency ? createMonetaryAmount(depositCents, currency) : null,
  }
}
