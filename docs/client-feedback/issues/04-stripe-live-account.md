chore: Tenant's live Stripe account — set up and wire to production

## Context
Client feedback 15 Nov 2026 — see
`docs/client-feedback/2026-11-15-poziadavky-klienta.md` §4.

The Stripe account is the **Tenant's own** (Part 4): money settles to the
company and survives independently of the maintainer. Mostly owner-side work.

## Open questions for the owner
- [ ] Company details ready (IČO, register extract, company IBAN)?
- [ ] Owner completes registration + KYC alone, or together with the maintainer?
- [ ] Production domain on Websupport ready (needed for the webhook URL)?

## Checklist
**Owner**
- [ ] Create the Stripe account in the company's name, complete KYC
- [ ] Business details: statement descriptor, support e-mail, public business name (Rent Star)
- [ ] Invite the maintainer as Developer (not Administrator)

**Maintainer**
- [ ] Live secret key + webhook signing secret into Netlify env — never in the repo
- [ ] Webhook endpoint on the production domain, events used by payment-webhook-flow.ts only
- [ ] Hosted checkout branding (D-59 public identity)
- [ ] One live payment end to end; verify the Reservation confirms via webhook
- [ ] Note: refunds / cancellation still blocked on OQ #1 — do not build a refund path here

## Governing identifiers
D-26, NFR-05, OQ #1
