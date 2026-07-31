import { beforeEach, describe, expect, it } from 'vitest'
import type { TenantId } from '../../../../server/contexts/_shared'
import {
  bulkRegisterAssets,
  EmptyBulkRegistrationError,
  InvalidBulkRegistrationLineError,
  MalformedCsvRowError,
  parseBulkRegistrationCsv,
} from '../../../../server/contexts/asset-registry/bulk-registration'
import { AssetTypeNotFoundError } from '../../../../server/contexts/asset-registry/types'
import { createFakeAssetRegistryRepository, type FakeAssetRegistryRepository } from './fake-repository'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId
const operatorId = '33333333-3333-3333-3333-333333333333'

describe('bulkRegisterAssets (F10, FR-25, FR-26, W9, issue #9)', () => {
  let repo: FakeAssetRegistryRepository

  beforeEach(() => {
    repo = createFakeAssetRegistryRepository()
    repo.seedAssetType(tenantA, 1)
    repo.seedAssetType(tenantA, 2)
  })

  it('registers the requested quantity of Assets per line, each with a freshly bound, distinct tag code', async () => {
    const units = await bulkRegisterAssets(repo, {
      tenantId: tenantA,
      operatorId,
      lines: [
        { assetTypeId: 1, quantity: 3 },
        { assetTypeId: 2, quantity: 2 },
      ],
    })

    expect(units).toHaveLength(5)
    expect(units.filter((u) => u.asset.assetTypeId === 1)).toHaveLength(3)
    expect(units.filter((u) => u.asset.assetTypeId === 2)).toHaveLength(2)

    const tagCodes = units.map((u) => u.tag.tagCode)
    expect(new Set(tagCodes).size).toBe(5) // all distinct

    // FR-27/W9: newly registered Assets default to unavailable, same as
    // a single manual registerAsset call — bulk import does not silently
    // skip the Operator's own final "mark Rentable" step.
    expect(units.every((u) => u.asset.status === 'unavailable')).toBe(true)
  })

  it('never reuses a tag code across two separate bulk-registration calls', async () => {
    const first = await bulkRegisterAssets(repo, { tenantId: tenantA, operatorId, lines: [{ assetTypeId: 1, quantity: 2 }] })
    const second = await bulkRegisterAssets(repo, { tenantId: tenantA, operatorId, lines: [{ assetTypeId: 1, quantity: 2 }] })

    const allCodes = [...first, ...second].map((u) => u.tag.tagCode)
    expect(new Set(allCodes).size).toBe(4)
  })

  it('refuses an empty line list', async () => {
    await expect(bulkRegisterAssets(repo, { tenantId: tenantA, operatorId, lines: [] })).rejects.toThrow(
      EmptyBulkRegistrationError,
    )
  })

  it('refuses a line with a zero or negative quantity, before creating anything', async () => {
    await expect(
      bulkRegisterAssets(repo, {
        tenantId: tenantA,
        operatorId,
        lines: [
          { assetTypeId: 1, quantity: 3 },
          { assetTypeId: 2, quantity: 0 },
        ],
      }),
    ).rejects.toThrow(InvalidBulkRegistrationLineError)

    expect(repo.allTags()).toHaveLength(0)
  })

  it('refuses an unknown AssetType, via the same guard registerAsset already has', async () => {
    await expect(
      bulkRegisterAssets(repo, { tenantId: tenantA, operatorId, lines: [{ assetTypeId: 999, quantity: 1 }] }),
    ).rejects.toThrow(AssetTypeNotFoundError)
  })
})

describe('parseBulkRegistrationCsv', () => {
  it('parses (assetTypeId, quantity) rows, skipping an optional header', () => {
    const lines = parseBulkRegistrationCsv('assetTypeId,quantity\n1,50\n2,20')
    expect(lines).toEqual([
      { assetTypeId: 1, quantity: 50 },
      { assetTypeId: 2, quantity: 20 },
    ])
  })

  it('parses rows with no header', () => {
    const lines = parseBulkRegistrationCsv('1,50\n2,20')
    expect(lines).toEqual([
      { assetTypeId: 1, quantity: 50 },
      { assetTypeId: 2, quantity: 20 },
    ])
  })

  it('ignores blank lines', () => {
    const lines = parseBulkRegistrationCsv('1,50\n\n\n2,20\n')
    expect(lines).toHaveLength(2)
  })

  it('refuses a malformed row, naming the row number', () => {
    expect(() => parseBulkRegistrationCsv('1,50\nnot-a-number,20')).toThrow(MalformedCsvRowError)
  })

  it('refuses a row with the wrong number of columns', () => {
    expect(() => parseBulkRegistrationCsv('1,50,extra')).toThrow(MalformedCsvRowError)
  })
})
