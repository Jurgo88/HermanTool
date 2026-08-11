import { z } from 'zod'
import { PinTooShortError, setOperatorPin } from '../../utils/operator-pin'
import { createAuthDeps, requireOperator } from '../../utils/operator-session'

const bodySchema = z.object({ pin: z.string().min(4).max(12) })

// F8/D-22/FR-36: self-service only — an Operator sets their OWN PIN,
// used later for per-action reconfirmation on the shared counter phone
// (server/utils/operator-pin.ts). No admin surface (D-22): there is no
// route for one Operator to set or view another's PIN.
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const { deps, close } = createAuthDeps(event)

  try {
    await setOperatorPin(deps.operators, operator.id, body.pin)
    return { ok: true }
  } catch (err) {
    if (err instanceof PinTooShortError) {
      throw createError({ statusCode: 400, statusMessage: err.message, data: { code: err.constructor.name } })
    }
    throw err
  } finally {
    await close()
  }
})
