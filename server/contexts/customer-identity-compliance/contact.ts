// Contact matching for D-65's limit (issue #215): at most one active
// on-site ReservationGroup per contact, matched on normalised e-mail OR
// normalised phone. There are no accounts (D-14) and Customer records are
// never merged — this only compares the details typed at checkout.
//
// Pure, so the matching rule is testable without a database.
import { CustomerIdentityComplianceError } from './types'

export interface ContactDetails {
  email: string
  phone: string
}

// Case and surrounding space never make two addresses different.
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

// Slovak numbers in the forms people type them — "+421 900 123 456",
// "00421900123456", "0900 123 456", "900123456" — all become
// "+421900123456". A number in another country's format keeps its own
// digits with a leading plus, so it still matches itself.
export function normalisePhone(phone: string): string {
  const trimmed = phone.trim()
  const digits = trimmed.replace(/\D/g, '')
  if (digits === '') return ''
  if (trimmed.startsWith('+')) return `+${digits}`
  if (digits.startsWith('00')) return `+${digits.slice(2)}`
  if (digits.startsWith('0') && digits.length === 10) return `+421${digits.slice(1)}`
  if (digits.length === 9) return `+421${digits}`
  return `+${digits}`
}

export function contactsMatch(a: ContactDetails, b: ContactDetails): boolean {
  const emailA = normaliseEmail(a.email)
  const phoneA = normalisePhone(a.phone)
  return (
    (emailA !== '' && emailA === normaliseEmail(b.email)) ||
    (phoneA !== '' && phoneA === normalisePhone(b.phone))
  )
}

// D-65: the contact already has an on-site ReservationGroup that is still
// active (see server/utils/on-site-payment.ts for "active").
export class OnSitePaymentLimitReachedError extends CustomerIdentityComplianceError {
  constructor() {
    super('This contact already has an active ReservationGroup paid on site (D-65).')
  }
}

export function assertNoActiveOnSiteGroupForContact(
  contact: ContactDetails,
  activeOnSiteContacts: ContactDetails[],
): void {
  if (activeOnSiteContacts.some((other) => contactsMatch(contact, other))) {
    throw new OnSitePaymentLimitReachedError()
  }
}
