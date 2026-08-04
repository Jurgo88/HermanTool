import { confirmConditionReportUpload } from '../../../../contexts/handover-possession'
import {
  createHandoverPossessionDeps,
  getConditionReportIdParam,
  translateHandoverPossessionError,
} from '../../../../utils/handover-possession-deps'
import { requireOperator } from '../../../../utils/operator-session'

// D-40, issue #78/IR-10: the Operator's confirmation call after a
// ConditionReport's photo(s) finish uploading to the presigned URLs
// ../../handover-out.post.ts / handover-in.post.ts returned. Shared by
// both stages — confirmConditionReportUpload does not care which.
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const conditionReportId = getConditionReportIdParam(event)

  const { repo, conditionsGateway, close } = createHandoverPossessionDeps(event)
  try {
    return await confirmConditionReportUpload(repo, conditionsGateway, {
      tenantId: operator.tenantId,
      conditionReportId,
    })
  } catch (err) {
    translateHandoverPossessionError(err)
  } finally {
    await close()
  }
})
