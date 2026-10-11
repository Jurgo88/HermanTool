import { beforeEach, describe, expect, it } from 'vitest'
import type { TenantId } from '../../../server/contexts/_shared'
import type { CatalogRepository } from '../../../server/contexts/catalog'
import { buildConfirmationSummary } from '../../../server/utils/customer-email-data'
import { createFakeCatalogRepository } from '../contexts/catalog/fake-repository'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId
const operatorId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

describe('buildConfirmationSummary (FR-32, #189)', () => {
  let catalogRepo: CatalogRepository
  let drill: number
  let saw: number

  beforeEach(async () => {
    catalogRepo = createFakeCatalogRepository()
    drill = (
      await catalogRepo.insertAssetType(tenantA, {
        name: 'Vŕtačka',
        description: '',
        dayRate: { amount: 1000, currency: 'EUR' },
        depositAmount: { amount: 5000, currency: 'EUR' },
        operatorId,
      })
    ).id
    saw = (
      await catalogRepo.insertAssetType(tenantA, {
        name: 'Píla',
        description: '',
        dayRate: { amount: 1500, currency: 'EUR' },
        depositAmount: { amount: 8000, currency: 'EUR' },
        operatorId,
      })
    ).id
  })

  const period = { startDay: '2026-03-05', endDay: '2026-03-07' }

  it('groups identical units into one line with a quantity and sums the deposit', async () => {
    const { lines, depositTotal } = await buildConfirmationSummary(catalogRepo, tenantA, [
      { assetTypeId: drill, period },
      { assetTypeId: saw, period },
      { assetTypeId: drill, period },
    ])

    expect(lines).toEqual([
      { assetTypeName: 'Vŕtačka', quantity: 2, ...period },
      { assetTypeName: 'Píla', quantity: 1, ...period },
    ])
    expect(depositTotal).toEqual({ amount: 18000, currency: 'EUR' })
  })

  it('keeps different periods of the same tool apart', async () => {
    const { lines } = await buildConfirmationSummary(catalogRepo, tenantA, [
      { assetTypeId: drill, period },
      { assetTypeId: drill, period: { startDay: '2026-03-10', endDay: '2026-03-11' } },
    ])
    expect(lines).toHaveLength(2)
  })

  it('names an unknown tool in plain words and names no deposit total', async () => {
    const { lines, depositTotal } = await buildConfirmationSummary(catalogRepo, tenantA, [
      { assetTypeId: 9999, period },
    ])
    expect(lines[0]!.assetTypeName).toBe('vaše náradie')
    expect(depositTotal).toBeNull()
  })

  it('is scoped by Tenant (FR-33)', async () => {
    const other = '22222222-2222-2222-2222-222222222222' as TenantId
    const { lines } = await buildConfirmationSummary(catalogRepo, other, [{ assetTypeId: drill, period }])
    expect(lines[0]!.assetTypeName).toBe('vaše náradie')
  })
})
