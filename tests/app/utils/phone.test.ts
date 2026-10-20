import { describe, expect, it } from 'vitest'
import { phoneHref } from '../../../app/utils/phone'

describe('phoneHref (S-08, S-14, S-15)', () => {
  it('keeps the leading plus and the digits', () => {
    expect(phoneHref('+421 900 123 456')).toBe('tel:+421900123456')
  })

  it('drops separators a Customer may type', () => {
    expect(phoneHref('0900/123-456')).toBe('tel:0900123456')
  })
})
