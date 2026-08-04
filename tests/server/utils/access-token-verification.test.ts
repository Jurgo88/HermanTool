// Tests server/utils/access-token-verification.ts against a REAL ES256
// keypair and real jose.jwtVerify -- not a fake -- since this file's
// entire job is verifying a signature, which cannot be meaningfully
// faked. Uses jose.createLocalJWKSet with a locally-generated keypair
// instead of createSupabaseJwksKeySet's real network fetch, so this runs
// with no network access, matching every other unit test in this repo.
import { describe, expect, it } from 'vitest'
import { exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey, type KeyLike } from 'jose'
import { createLocalJWKSet } from 'jose'
import { verifyAccessTokenLocally } from '../../../server/utils/access-token-verification'

async function makeKeySet(): Promise<{ getKey: JWTVerifyGetKey; privateKey: KeyLike; kid: string }> {
  const { publicKey, privateKey } = await generateKeyPair('ES256')
  const kid = 'test-key-1'
  const jwk = await exportJWK(publicKey)
  const getKey = createLocalJWKSet({ keys: [{ ...jwk, kid, alg: 'ES256', use: 'sig' }] })
  return { getKey, privateKey, kid }
}

async function signToken(
  privateKey: KeyLike,
  kid: string,
  params: { sub: string; expiresInSeconds: number },
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid })
    .setSubject(params.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + params.expiresInSeconds)
    .sign(privateKey)
}

describe('verifyAccessTokenLocally (D-39/IR-09)', () => {
  it('verifies a validly-signed, unexpired token and extracts the user id from `sub`', async () => {
    const { getKey, privateKey, kid } = await makeKeySet()
    const token = await signToken(privateKey, kid, { sub: 'auth-user-1', expiresInSeconds: 3600 })

    const result = await verifyAccessTokenLocally(token, getKey)

    expect(result).toEqual({ userId: 'auth-user-1' })
  })

  it('rejects an expired token without throwing (the caller falls back to the refresh path)', async () => {
    const { getKey, privateKey, kid } = await makeKeySet()
    const token = await signToken(privateKey, kid, { sub: 'auth-user-1', expiresInSeconds: -60 })

    const result = await verifyAccessTokenLocally(token, getKey)

    expect(result).toBeNull()
  })

  it('rejects a token signed by a DIFFERENT key -- the whole point of verifying the signature at all', async () => {
    const { getKey } = await makeKeySet()
    const forged = await makeKeySet() // a second, unrelated keypair
    const token = await signToken(forged.privateKey, forged.kid, { sub: 'auth-user-1', expiresInSeconds: 3600 })

    const result = await verifyAccessTokenLocally(token, getKey)

    expect(result).toBeNull()
  })

  it('rejects a malformed token', async () => {
    const { getKey } = await makeKeySet()

    const result = await verifyAccessTokenLocally('not-a-jwt', getKey)

    expect(result).toBeNull()
  })

  it('rejects a validly-signed token with no `sub` claim', async () => {
    const { getKey, privateKey, kid } = await makeKeySet()
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid })
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(privateKey)

    const result = await verifyAccessTokenLocally(token, getKey)

    expect(result).toBeNull()
  })
})
