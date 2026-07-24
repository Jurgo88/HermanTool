import { z } from 'zod'
import { signInOperator, InvalidCredentialsError, OperatorNotProvisionedError } from '../../utils/auth'
import { createAuthDeps, writeSessionCookie } from '../../utils/operator-session'

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

// Nitro-only login (D-25, D-31): the browser posts credentials here and
// receives an httpOnly session cookie back. It never talks to Supabase
// Auth directly and never receives the access/refresh tokens in the
// response body — those live only in the cookie.
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)
  const { deps, close } = createAuthDeps(event)

  try {
    const { operator, session } = await signInOperator(deps, body)
    writeSessionCookie(event, session)
    return { operatorId: operator.id, displayName: operator.displayName }
  } catch (err) {
    if (err instanceof InvalidCredentialsError || err instanceof OperatorNotProvisionedError) {
      throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
    }
    throw err
  } finally {
    await close()
  }
})
