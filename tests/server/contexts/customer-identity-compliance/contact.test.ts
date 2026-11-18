import { describe, expect, it } from 'vitest'
import {
  OnSitePaymentLimitReachedError,
  assertNoActiveOnSiteGroupForContact,
  contactsMatch,
  normaliseEmail,
  normalisePhone,
} from '../../../../server/contexts/customer-identity-compliance/contact'

describe('contact normalisation (D-65 limit, D-14 no accounts)', () => {
  it('ignores case and surrounding space in an e-mail', () => {
    expect(normaliseEmail('  Jana.Novakova@Example.SK ')).toBe('jana.novakova@example.sk')
  })

  it('reads Slovak numbers in the forms people type them as one', () => {
    for (const typed of [
      '+421 900 123 456',
      '00421900123456',
      '0900 123 456',
      '900123456',
      '+421-900-123-456',
    ]) {
      expect(normalisePhone(typed)).toBe('+421900123456')
    }
  })

  it('keeps a foreign number distinct', () => {
    expect(normalisePhone('+420 601 123 456')).toBe('+420601123456')
    expect(normalisePhone('+420 601 123 456')).not.toBe(normalisePhone('+421 601 123 456'))
  })
})

describe('one active on-site ReservationGroup per contact (D-65)', () => {
  const active = [{ email: 'jana@example.sk', phone: '+421900123456' }]

  it('refuses the same e-mail in another case', () => {
    expect(() =>
      assertNoActiveOnSiteGroupForContact(
        { email: 'JANA@example.sk', phone: '+421911000000' },
        active,
      ),
    ).toThrow(OnSitePaymentLimitReachedError)
  })

  it('refuses the same phone in another format, under another e-mail', () => {
    expect(() =>
      assertNoActiveOnSiteGroupForContact(
        { email: 'iny@example.sk', phone: '0900 123 456' },
        active,
      ),
    ).toThrow(OnSitePaymentLimitReachedError)
  })

  it('accepts a different contact', () => {
    expect(() =>
      assertNoActiveOnSiteGroupForContact(
        { email: 'peter@example.sk', phone: '0911 222 333' },
        active,
      ),
    ).not.toThrow()
  })

  it('never matches on an empty phone', () => {
    expect(contactsMatch({ email: 'a@x.sk', phone: '' }, { email: 'b@x.sk', phone: ' ' })).toBe(
      false,
    )
  })
})
