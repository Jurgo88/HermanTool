// In-memory stand-ins for AuthDeps, used by auth.test.ts so
// server/utils/auth.ts is exercised without a network call or a
// database (Part 4 §14.2).
import type { TenantId } from '../../../server/contexts/_shared'
import type { AuthDeps, SupabaseAuthClient } from '../../../server/utils/auth'
import type { Operator, OperatorRepository } from '../../../server/utils/operators'

interface FakeAuthUser {
  id: string
  email: string
  password: string
}

export interface FakeSupabaseAuthClient extends SupabaseAuthClient {
  seedUser(user: FakeAuthUser): void
  expireAccessToken(accessToken: string): void
  revokeRefreshToken(refreshToken: string): void
}

function tokenFor(userId: string, kind: 'access' | 'refresh', generation: number): string {
  return `${kind}-${userId}-${generation}`
}

export function createFakeSupabaseAuthClient(): FakeSupabaseAuthClient {
  const users: FakeAuthUser[] = []
  // Valid access tokens map to a user id; "expired" ones are removed but
  // the matching refresh token stays valid, mirroring a real access
  // token that has timed out while the session underneath is still good.
  const validAccessTokens = new Map<string, string>()
  const validRefreshTokens = new Map<string, string>()
  let generation = 0

  function issueSession(userId: string) {
    generation += 1
    const accessToken = tokenFor(userId, 'access', generation)
    const refreshToken = tokenFor(userId, 'refresh', generation)
    validAccessTokens.set(accessToken, userId)
    validRefreshTokens.set(refreshToken, userId)
    return { access_token: accessToken, refresh_token: refreshToken, user: { id: userId } }
  }

  return {
    seedUser(user) {
      users.push(user)
    },

    expireAccessToken(accessToken) {
      validAccessTokens.delete(accessToken)
    },

    revokeRefreshToken(refreshToken) {
      validRefreshTokens.delete(refreshToken)
    },

    auth: {
      async signInWithPassword({ email, password }) {
        const user = users.find((u) => u.email === email && u.password === password)
        if (!user) return { data: { session: null }, error: { message: 'Invalid login credentials' } }
        return { data: { session: issueSession(user.id) }, error: null }
      },

      async getUser(accessToken) {
        const userId = validAccessTokens.get(accessToken)
        if (!userId) return { data: { user: null }, error: { message: 'invalid JWT' } }
        return { data: { user: { id: userId } }, error: null }
      },

      async refreshSession({ refresh_token: refreshToken }) {
        const userId = validRefreshTokens.get(refreshToken)
        if (!userId) return { data: { session: null }, error: { message: 'invalid refresh token' } }
        validRefreshTokens.delete(refreshToken)
        return { data: { session: issueSession(userId) }, error: null }
      },

      async setSession() {
        return { data: { session: null }, error: null }
      },

      async signOut() {
        return { error: null }
      },
    },
  }
}

export function createFakeOperatorRepository(operators: Operator[] = []): OperatorRepository {
  return {
    async findByAuthUserId(authUserId) {
      return operators.find((o) => o.id === authUserId) ?? null
    },
  }
}

export function fakeOperator(overrides: Partial<Operator> = {}): Operator {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222' as TenantId,
    displayName: 'Test Operator',
    ...overrides,
  }
}

export function createFakeAuthDeps(params: { supabase: FakeSupabaseAuthClient; operators: Operator[] }): AuthDeps {
  return {
    supabase: params.supabase,
    operators: createFakeOperatorRepository(params.operators),
  }
}
