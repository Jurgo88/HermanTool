import { describe, expect, it } from 'vitest'
import { getErrorCode } from '../../../app/utils/error-code'

describe('getErrorCode (D-50, #176)', () => {
  it('reads the code from a $fetch error, where h3 nests it under data.data', () => {
    // The shape ofetch's FetchError has: the response body on .data.
    const err = Object.assign(new Error('409 Conflict'), {
      data: { statusCode: 409, statusMessage: 'x', data: { code: 'ClassificationInUseError' } },
    })
    expect(getErrorCode(err)).toBe('ClassificationInUseError')
  })

  it('still reads an error object that carries the code directly', () => {
    expect(getErrorCode({ data: { code: 'InvalidPinError' } })).toBe('InvalidPinError')
  })

  it('returns null for a network failure or an uncoded error', () => {
    expect(getErrorCode(new Error('offline'))).toBeNull()
    expect(getErrorCode({ data: { statusCode: 500 } })).toBeNull()
    expect(getErrorCode(null)).toBeNull()
  })
})
