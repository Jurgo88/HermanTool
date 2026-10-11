// The words of the four Customer emails, in one file so the owner can read and
// approve all of them in one place (D-20: no user-facing text scattered through
// the code; #189). Pure text: every value arrives already formatted, and
// nothing here knows what a Reservation is (Notification stays dumb, D-28).
//
// Register: Slovak, "vykanie", plain sentences, no exclamation marks, the same
// as the interface (design foundation §7). The signature is the Tenant's
// trading name, copy and not configuration, as on the public header (D-59).
//
// What these emails deliberately do NOT say:
//   - nothing about uploading an identity document: that channel is blocked
//     until OQ #2 gives the retention window a value, and a Customer must not
//     be sent to a step that will refuse them. The counter takes the document
//     at pickup (FR-13), and the emails say to bring it;
//   - no cancellation or refund wording (OQ #1);
//   - no opening hours or address, which the system does not hold.
const TRADING_NAME = 'Rent Star'

// What a Customer reads when a tool's name cannot be found. The Operator
// worklists show "AssetType 13" instead (a row must not vanish); an email
// must not.
export const UNNAMED_ASSET_TYPE = 'vaše náradie'

export interface EmailText {
  subject: string
  body: string
}

const greeting = (name: string) => `Dobrý deň, ${name},`
const signoff = `S pozdravom\n${TRADING_NAME}`

const PICKUP_NEEDS = 'Pri prevzatí si prineste doklad totožnosti.'

export function reservationConfirmationText(params: {
  customerName: string
  lines: { name: string; quantity: number; period: string }[]
  depositTotal: string | null
  termsVersion: string | null
  accessLinkUrl: string
}): EmailText {
  const lines = params.lines
    .map((line) => `- ${line.name}${line.quantity > 1 ? ` × ${line.quantity}` : ''}, ${line.period}`)
    .join('\n')
  const deposit = params.depositTotal
    ? `Zálohu ${params.depositTotal} zaplatíte v hotovosti pri prevzatí, nie kartou.`
    : 'Zálohu zaplatíte v hotovosti pri prevzatí, nie kartou.'
  const terms = params.termsVersion
    ? `\nPotvrdili ste podmienky prenájmu (verzia ${params.termsVersion}).\n`
    : ''

  return {
    subject: 'Rezervácia je potvrdená',
    body:
      `${greeting(params.customerName)}\n\n` +
      `vaša rezervácia je potvrdená a zaplatená:\n\n${lines}\n\n` +
      `${PICKUP_NEEDS} ${deposit}\n\n` +
      `Rezerváciu si môžete kedykoľvek pozrieť tu:\n${params.accessLinkUrl}\n` +
      `${terms}\n` +
      `Tešíme sa na vás.\n\n${signoff}`,
  }
}

export function pickupReminderText(params: {
  customerName: string
  assetTypeName: string
  period: string
}): EmailText {
  return {
    subject: 'Pripomienka: vyzdvihnutie náradia',
    body:
      `${greeting(params.customerName)}\n\n` +
      `pripomíname, že vaša rezervácia sa začína dnes (${params.period}):\n\n` +
      `- ${params.assetTypeName}\n\n` +
      `${PICKUP_NEEDS} Zálohu zaplatíte v hotovosti.\n\n${signoff}`,
  }
}

export function returnReminderText(params: {
  customerName: string
  assetTypeName: string
  dueDay: string
}): EmailText {
  return {
    subject: 'Pripomienka: vrátenie náradia',
    body:
      `${greeting(params.customerName)}\n\n` +
      `pripomíname, že ${params.assetTypeName} treba vrátiť ${params.dueDay}.\n\n` +
      `Ďakujeme, že ho vrátite načas.\n\n${signoff}`,
  }
}

export function overdueReminderText(params: {
  customerName: string
  assetTypeName: string
  dueDay: string
}): EmailText {
  return {
    subject: 'Náradie ste mali vrátiť',
    body:
      `${greeting(params.customerName)}\n\n` +
      `${params.assetTypeName} sa malo vrátiť ${params.dueDay} a zatiaľ sme ho neprijali späť. ` +
      `Prosíme, vráťte ho čo najskôr, alebo nás kontaktujte.\n\n${signoff}`,
  }
}
