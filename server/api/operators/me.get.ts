import { requireOperator } from '../../utils/operator-session'

// S-23/UIF-05, D-16, FR-34: attribution is only meaningful if the
// Operator can see who they are signed in as (OperatorBar, C-20). No
// admin surface exists to look up ANOTHER Operator (D-22) — this always
// resolves to the caller's own session, nothing else.
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  return { id: operator.id, displayName: operator.displayName }
})
