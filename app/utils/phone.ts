// A `tel:` link for the phone number a Customer typed at checkout: digits and
// a leading plus only, so "+421 900 123 456" dials as typed.
export function phoneHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}
