import { CATALOG_IMAGE_FILES } from '../../utils/catalog-image-manifest'
import { requireOperator } from '../../utils/operator-session'

// D-56, S-19: the catalog images that shipped with this build, for the
// admin image select. Adding one is a commit, never an upload.
export default defineEventHandler(async (event) => {
  await requireOperator(event)
  return CATALOG_IMAGE_FILES
})
