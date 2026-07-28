// H3/Nuxt-specific glue around ./internal-job-auth.ts's pure comparison:
// runtime config resolution and translation to an H3 error. Not unit
// tested for the same reason ./operator-session.ts isn't — it is
// Nuxt-runtime glue, not the tested logic (Part 4 §14.2).
import { createError, getHeader, type H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import {
  InvalidInternalJobSecretError,
  MissingInternalJobSecretError,
  verifyInternalJobSecret,
} from './internal-job-auth'

// The gate every internal/scheduled route calls, in place of
// requireOperator() — never both, and nothing behind this gate may be
// attributed to an Operator (FR-34): the caller is the platform itself
// (Part 2 §7 "The Platform, acting on a policy"), not a person.
export function requireInternalJobSecret(event: H3Event): void {
  const config = useRuntimeConfig(event)

  try {
    verifyInternalJobSecret({
      authorizationHeader: getHeader(event, 'authorization'),
      expectedSecret: config.internalJobSecret,
    })
  } catch (err) {
    if (err instanceof MissingInternalJobSecretError) {
      throw createError({ statusCode: 500, statusMessage: err.message })
    }
    if (err instanceof InvalidInternalJobSecretError) {
      throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' })
    }
    throw err
  }
}
