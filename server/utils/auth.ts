// Operator sign-in and session resolution (D-22, FR-33, FR-34, NFR-09).
// Kept as ordinary TypeScript against a narrow SupabaseAuthClient port,
// not the concrete `@supabase/supabase-js` client, so this is testable
// without a network call or a database — same rationale as Part 4
// §14.2 and the repository pattern used by every domain context.
import type { OperatorRepository, Operator } from './operators'

export interface OperatorSession {
  accessToken: string
  refreshToken: string
}

interface AuthUser {
  id: string
}

// Raw shape returned by @supabase/supabase-js's Auth methods (snake_case,
// as the Auth API sends it) — distinct from this module's own
// `OperatorSession` (camelCase), which is the shape everything else in
// this codebase (cookies, callers) actually works with.
interface RawAuthSession {
  access_token: string
  refresh_token: string
  user: AuthUser
}

interface AuthTokenResult {
  data: { session: RawAuthSession | null }
  error: { message: string } | null
}

interface AuthUserResult {
  data: { user: AuthUser | null }
  error: { message: string } | null
}

// Structurally satisfied by the real `SupabaseClient` from
// @supabase/supabase-js (see ./supabase.ts) — only the Auth methods this
// module and ../api/auth/logout.post.ts actually call are named here.
export interface SupabaseAuthClient {
  auth: {
    signInWithPassword(credentials: { email: string; password: string }): Promise<AuthTokenResult>
    getUser(accessToken: string): Promise<AuthUserResult>
    refreshSession(params: { refresh_token: string }): Promise<AuthTokenResult>
    setSession(session: { access_token: string; refresh_token: string }): Promise<AuthTokenResult>
    signOut(): Promise<{ error: { message: string } | null }>
  }
}

export interface AuthDeps {
  supabase: SupabaseAuthClient
  operators: OperatorRepository
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Email or password is incorrect.')
    this.name = new.target.name
  }
}

export class OperatorNotProvisionedError extends Error {
  constructor(authUserId: string) {
    super(`Authenticated user ${authUserId} has no Operator seat provisioned.`)
    this.name = new.target.name
  }
}

export class UnauthenticatedError extends Error {
  constructor() {
    super('No valid Operator session.')
    this.name = new.target.name
  }
}

export async function signInOperator(
  deps: AuthDeps,
  params: { email: string; password: string },
): Promise<{ operator: Operator; session: OperatorSession }> {
  const { data, error } = await deps.supabase.auth.signInWithPassword(params)
  if (error || !data.session) throw new InvalidCredentialsError()

  const operator = await deps.operators.findByAuthUserId(data.session.user.id)
  if (!operator) throw new OperatorNotProvisionedError(data.session.user.id)

  return {
    operator,
    session: { accessToken: data.session.access_token, refreshToken: data.session.refresh_token },
  }
}

// D-22: a session must stay signed in through a shift without forcing a
// re-login, so an access token that the Auth server no longer accepts is
// transparently refreshed rather than treated as a failure. The caller
// only sees UnauthenticatedError once the refresh token itself is no
// longer valid (expired, revoked, or never existed) — that is the actual
// end of the session, matching NFR-09's revocability requirement.
export async function resolveOperator(
  deps: AuthDeps,
  session: OperatorSession | null,
): Promise<{ operator: Operator; session: OperatorSession }> {
  if (!session) throw new UnauthenticatedError()

  const { data } = await deps.supabase.auth.getUser(session.accessToken)

  let activeSession = session
  let userId = data.user?.id

  if (!userId) {
    const refreshed = await deps.supabase.auth.refreshSession({ refresh_token: session.refreshToken })
    if (refreshed.error || !refreshed.data.session) throw new UnauthenticatedError()
    activeSession = {
      accessToken: refreshed.data.session.access_token,
      refreshToken: refreshed.data.session.refresh_token,
    }
    userId = refreshed.data.session.user.id
  }

  const operator = await deps.operators.findByAuthUserId(userId)
  if (!operator) throw new OperatorNotProvisionedError(userId)

  return { operator, session: activeSession }
}
