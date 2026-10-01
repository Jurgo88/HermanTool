import { listClassification } from '../../contexts/catalog'
import { createCatalogDeps } from '../../utils/catalog-deps'
import { getSeededTenantId } from '../../utils/tenant'

// S-01 filters (D-54): both lists in display order, for a Visitor — no
// session, nothing written.
export default defineEventHandler(async (event) => {
  const { repo, sql, close } = createCatalogDeps(event)

  try {
    const tenantId = await getSeededTenantId(sql)
    const [powerSources, useAreas] = await Promise.all([
      listClassification(repo, { tenantId, kind: 'powerSource' }),
      listClassification(repo, { tenantId, kind: 'useArea' }),
    ])
    const toView = ({ id, label }: { id: number; label: string }) => ({ id, label })
    return { powerSources: powerSources.map(toView), useAreas: useAreas.map(toView) }
  } finally {
    await close()
  }
})
