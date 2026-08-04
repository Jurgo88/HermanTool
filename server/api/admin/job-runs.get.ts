import { useRuntimeConfig } from '#imports'
import { createDatabaseClient } from '../../utils/db'
import { getJobRunStatuses } from '../../utils/job-run-ledger'
import { requireOperator } from '../../utils/operator-session'

// FR-40 (Must)/FR-44 (Should), D-41: the owner-visible read side of the
// job-run ledger. Not under server/api/<context>/ because this isn't
// owned by any bounded context (D-41: "platform housekeeping, not a
// domain event") -- server/api/admin/ groups surfaces like this one,
// mirroring app/pages/admin/'s own naming.
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const config = useRuntimeConfig(event)
  const sql = createDatabaseClient(config.databaseUrl)

  try {
    return await getJobRunStatuses(sql, operator.tenantId)
  } finally {
    await sql.end()
  }
})
