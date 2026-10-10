import { describe, expect, it } from 'vitest'
import {
  overdueReminderText,
  pickupReminderText,
  reservationConfirmationText,
  returnReminderText,
} from '../../../../server/contexts/notification/copy'

describe('Customer email copy (#189, D-20)', () => {
  const confirmation = reservationConfirmationText({
    customerName: 'Jana Nováková',
    lines: [{ name: 'Vŕtačka', quantity: 2, period: '5. – 7. 3. 2026' }],
    depositTotal: '100,00 €',
    termsVersion: 'v1',
    accessLinkUrl: 'https://example.test/reservations/access/tok',
  })

  it('names the tool, the quantity, the period, the deposit and the link', () => {
    expect(confirmation.body).toContain('Vŕtačka × 2, 5. – 7. 3. 2026')
    expect(confirmation.body).toContain('100,00 €')
    expect(confirmation.body).toContain('https://example.test/reservations/access/tok')
    expect(confirmation.body).toContain('verzia v1')
  })

  it('says the deposit is paid in cash even when the total is unknown', () => {
    const text = reservationConfirmationText({
      customerName: 'A',
      lines: [],
      depositTotal: null,
      termsVersion: null,
      accessLinkUrl: 'https://example.test/x',
    })
    expect(text.body).toContain('v hotovosti')
    expect(text.body).not.toContain('verzia')
  })

  it('promises nothing that is blocked by an open question (OQ #1, OQ #2)', () => {
    const all = [
      confirmation,
      pickupReminderText({ customerName: 'A', assetTypeName: 'Píla', period: 'dnes' }),
      returnReminderText({ customerName: 'A', assetTypeName: 'Píla', dueDay: 'dnes' }),
      overdueReminderText({ customerName: 'A', assetTypeName: 'Píla', dueDay: 'včera' }),
    ]
    for (const { subject, body } of all) {
      expect(`${subject} ${body}`).not.toMatch(/storn|vrátenie peňazí|refund|nahrajte|nahrať/i)
    }
  })

  it('names the tool in each reminder', () => {
    expect(pickupReminderText({ customerName: 'A', assetTypeName: 'Píla', period: 'x' }).body).toContain('Píla')
    expect(returnReminderText({ customerName: 'A', assetTypeName: 'Píla', dueDay: 'x' }).body).toContain('Píla')
    expect(overdueReminderText({ customerName: 'A', assetTypeName: 'Píla', dueDay: 'x' }).body).toContain('Píla')
  })
})
