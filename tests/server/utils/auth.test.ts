import { describe, expect, it, vi } from 'vitest'
import {
  InvalidCredentialsError,
  OperatorNotProvisionedError,
  resolveOperator,
  signInOperator,
  UnauthenticatedError,
} from '../../../server/utils/auth'
import { createFakeAuthDeps, createFakeSupabaseAuthClient, fakeOperator } from './fake-auth-deps'

describe('signInOperator', () => {
  it('signs in with correct credentials and returns the Operator seat (D-22)', async () => {
    const supabase = createFakeSupabaseAuthClient()
    supabase.seedUser({ id: 'auth-1', email: 'owner@example.com', password: 'correct-horse' })
    const operator = fakeOperator({ id: 'auth-1', displayName: 'Owner' })
    const deps = createFakeAuthDeps({ supabase, operators: [operator] })

    const result = await signInOperator(deps, { email: 'owner@example.com', password: 'correct-horse' })

    expect(result.operator).toEqual(operator)
    expect(result.session.accessToken).toBeTruthy()
    expect(result.session.refreshToken).toBeTruthy()
  })

  it('rejects an incorrect password without revealing which part was wrong', async () => {
    const supabase = createFakeSupabaseAuthClient()
    supabase.seedUser({ id: 'auth-1', email: 'owner@example.com', password: 'correct-horse' })
    const deps = createFakeAuthDeps({ supabase, operators: [fakeOperator({ id: 'auth-1' })] })

    await expect(
      signInOperator(deps, { email: 'owner@example.com', password: 'wrong' }),
    ).rejects.toThrow(InvalidCredentialsError)
  })

  it('rejects a valid Supabase Auth user with no provisioned Operator seat (D-16: no fallback to "an Operator")', async () => {
    const supabase = createFakeSupabaseAuthClient()
    supabase.seedUser({ id: 'auth-1', email: 'stranger@example.com', password: 'correct-horse' })
    const deps = createFakeAuthDeps({ supabase, operators: [] })

    await expect(
      signInOperator(deps, { email: 'stranger@example.com', password: 'correct-horse' }),
    ).rejects.toThrow(OperatorNotProvisionedError)
  })
})

describe('resolveOperator', () => {
  it('rejects a missing session', async () => {
    const supabase = createFakeSupabaseAuthClient()
    const deps = createFakeAuthDeps({ supabase, operators: [] })

    await expect(resolveOperator(deps, null)).rejects.toThrow(UnauthenticatedError)
  })

  it('resolves the Operator for a valid access token', async () => {
    const supabase = createFakeSupabaseAuthClient()
    supabase.seedUser({ id: 'auth-1', email: 'owner@example.com', password: 'correct-horse' })
    const operator = fakeOperator({ id: 'auth-1' })
    const deps = createFakeAuthDeps({ supabase, operators: [operator] })
    const { session } = await signInOperator(deps, { email: 'owner@example.com', password: 'correct-horse' })

    const result = await resolveOperator(deps, session)

    expect(result.operator).toEqual(operator)
    expect(result.session).toEqual(session)
  })

  it('transparently refreshes an expired access token (D-22: stays signed in through a shift)', async () => {
    const supabase = createFakeSupabaseAuthClient()
    supabase.seedUser({ id: 'auth-1', email: 'owner@example.com', password: 'correct-horse' })
    const operator = fakeOperator({ id: 'auth-1' })
    const deps = createFakeAuthDeps({ supabase, operators: [operator] })
    const { session } = await signInOperator(deps, { email: 'owner@example.com', password: 'correct-horse' })
    supabase.expireAccessToken(session.accessToken)

    const result = await resolveOperator(deps, session)

    expect(result.operator).toEqual(operator)
    expect(result.session.accessToken).not.toBe(session.accessToken)
  })

  it('rejects when both the access token and the refresh token are no longer valid (NFR-09: revocable)', async () => {
    const supabase = createFakeSupabaseAuthClient()
    supabase.seedUser({ id: 'auth-1', email: 'owner@example.com', password: 'correct-horse' })
    const operator = fakeOperator({ id: 'auth-1' })
    const deps = createFakeAuthDeps({ supabase, operators: [operator] })
    const { session } = await signInOperator(deps, { email: 'owner@example.com', password: 'correct-horse' })
    supabase.expireAccessToken(session.accessToken)
    supabase.revokeRefreshToken(session.refreshToken)

    await expect(resolveOperator(deps, session)).rejects.toThrow(UnauthenticatedError)
  })

  it('rejects a refreshed session whose auth user has no Operator seat', async () => {
    const supabase = createFakeSupabaseAuthClient()
    supabase.seedUser({ id: 'auth-1', email: 'owner@example.com', password: 'correct-horse' })
    // Signed in while provisioned, then the seat is removed (e.g. offboarded)
    // before the access token expires — the next refresh must not keep
    // granting access.
    const deps = createFakeAuthDeps({ supabase, operators: [fakeOperator({ id: 'auth-1' })] })
    const { session } = await signInOperator(deps, { email: 'owner@example.com', password: 'correct-horse' })
    supabase.expireAccessToken(session.accessToken)
    const depsAfterOffboarding = createFakeAuthDeps({ supabase, operators: [] })

    await expect(resolveOperator(depsAfterOffboarding, session)).rejects.toThrow(OperatorNotProvisionedError)
  })

  it('forceRemoteCheck (D-39 NFR-06 carve-out): bypasses local verification entirely and uses the remote getUser call', async () => {
    const supabase = createFakeSupabaseAuthClient()
    supabase.seedUser({ id: 'auth-1', email: 'owner@example.com', password: 'correct-horse' })
    const operator = fakeOperator({ id: 'auth-1' })
    const baseDeps = createFakeAuthDeps({ supabase, operators: [operator] })
    const { session } = await signInOperator(baseDeps, { email: 'owner@example.com', password: 'correct-horse' })

    const verifyAccessToken = vi.fn(baseDeps.verifyAccessToken)
    const deps = { ...baseDeps, verifyAccessToken }

    const result = await resolveOperator(deps, session, { forceRemoteCheck: true })

    expect(result.operator).toEqual(operator)
    // The whole point of the carve-out: the local path must not run at
    // all when a route asks for the remote check (NFR-06).
    expect(verifyAccessToken).not.toHaveBeenCalled()
  })

  it('without forceRemoteCheck, uses local verification (the D-39 default)', async () => {
    const supabase = createFakeSupabaseAuthClient()
    supabase.seedUser({ id: 'auth-1', email: 'owner@example.com', password: 'correct-horse' })
    const operator = fakeOperator({ id: 'auth-1' })
    const baseDeps = createFakeAuthDeps({ supabase, operators: [operator] })
    const { session } = await signInOperator(baseDeps, { email: 'owner@example.com', password: 'correct-horse' })

    const verifyAccessToken = vi.fn(baseDeps.verifyAccessToken)
    const deps = { ...baseDeps, verifyAccessToken }

    const result = await resolveOperator(deps, session)

    expect(result.operator).toEqual(operator)
    expect(verifyAccessToken).toHaveBeenCalledWith(session.accessToken)
  })
})
