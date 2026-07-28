import { describe, expect, it } from 'vitest'
import {
  InvalidInternalJobSecretError,
  MissingInternalJobSecretError,
  verifyInternalJobSecret,
} from '../../../server/utils/internal-job-auth'

describe('verifyInternalJobSecret', () => {
  it('accepts a correctly-prefixed header matching the configured secret', () => {
    expect(() =>
      verifyInternalJobSecret({ authorizationHeader: 'Bearer correct-secret', expectedSecret: 'correct-secret' }),
    ).not.toThrow()
  })

  it('rejects a missing Authorization header', () => {
    expect(() =>
      verifyInternalJobSecret({ authorizationHeader: undefined, expectedSecret: 'correct-secret' }),
    ).toThrow(InvalidInternalJobSecretError)
  })

  it('rejects a header missing the Bearer prefix', () => {
    expect(() =>
      verifyInternalJobSecret({ authorizationHeader: 'correct-secret', expectedSecret: 'correct-secret' }),
    ).toThrow(InvalidInternalJobSecretError)
  })

  it('rejects a mismatched secret', () => {
    expect(() =>
      verifyInternalJobSecret({ authorizationHeader: 'Bearer wrong-secret', expectedSecret: 'correct-secret' }),
    ).toThrow(InvalidInternalJobSecretError)
  })

  it('rejects a secret differing only in length rather than accepting a prefix match', () => {
    expect(() =>
      verifyInternalJobSecret({ authorizationHeader: 'Bearer correct-secret-extra', expectedSecret: 'correct-secret' }),
    ).toThrow(InvalidInternalJobSecretError)
  })

  it('refuses to authenticate anything when the secret is not configured, rather than accepting an empty match', () => {
    expect(() => verifyInternalJobSecret({ authorizationHeader: 'Bearer ', expectedSecret: '' })).toThrow(
      MissingInternalJobSecretError,
    )
  })
})
