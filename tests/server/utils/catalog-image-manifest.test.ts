import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CATALOG_IMAGE_FILES } from '../../../server/utils/catalog-image-manifest'
import { updateAssetTypeBodySchema } from '../../../server/utils/catalog-validation'

describe('catalog image manifest (D-56)', () => {
  it('lists only files that actually ship under public/catalog/', () => {
    expect(CATALOG_IMAGE_FILES.length).toBeGreaterThan(0)
    for (const file of CATALOG_IMAGE_FILES) {
      expect(file).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*\.webp$/)
      expect(existsSync(`public/catalog/${file}`)).toBe(true)
    }
  })

  it('accepts a shipped image, null, or nothing, and refuses anything else', () => {
    const shipped = CATALOG_IMAGE_FILES[0]!
    expect(updateAssetTypeBodySchema.safeParse({ imageFile: shipped }).success).toBe(true)
    expect(updateAssetTypeBodySchema.safeParse({ imageFile: null }).success).toBe(true)
    expect(updateAssetTypeBodySchema.safeParse({}).success).toBe(true)
    expect(updateAssetTypeBodySchema.safeParse({ imageFile: 'not-shipped.webp' }).success).toBe(
      false,
    )
  })
})
