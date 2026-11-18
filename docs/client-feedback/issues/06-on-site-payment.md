feat: pay on site (eKasa) as an alternative to online prepayment, with a discount for paying online

## Context
Client feedback 15 Nov 2026, agreed 17 Nov 2026 — see
`docs/client-feedback/2026-11-15-poziadavky-klienta.md` §2.

The Customer chooses at checkout: **online now** (Stripe, as today) or **on site**
at pickup through the Tenant's eKasa (cash, card terminal or QR). The platform never
moves on-site money — it records an Operator attestation, exactly like the deposit (P6, D-07).
Instead of a surcharge for on-site payment, **online prepayment gets a % discount**.

## Decisions (agreed with the owner)
1. **Discount for online prepayment:** one Tenant setting (percent), rental fee only, never
   the deposit. Shown as „25 €/deň · pri platbe online 22,50 €“; the server computes the
   final amount, shown before submit. Not a pricing engine (Pricing & Promotions stays `[Future]`).
   **Percentage value still to be agreed with the client.**
2. **On-site payment attestation:** PIN-gated (D-16, F8) Operator record — amount with
   currency (D-21) and method (cash / card terminal / QR). Correctable per P1.
3. **HandoverOut refuses** a ReservationGroup whose rental fee is neither paid online nor
   attested on site (same pattern as the D-35 terms check).
4. **Limit:** at most **one active on-site-payment ReservationGroup per contact**, matched on
   normalised e-mail **or** phone (+421…). No accounts (D-14).
5. **E-mail confirmation:** an on-site ReservationGroup is confirmed only after the Customer
   clicks the link in the e-mail (Resend, D-28). Until then its Reservations stay `pending`
   with `pending_expires_at`, exactly like an unpaid online checkout today.
6. **IdentityEvidence** for on-site payment is captured by the Operator at the counter
   (D-15 option (c)); nothing is uploaded online on this path.
7. Reminder e-mail the day before; NoShow releases the remainder of the period.

## Blocked — do NOT implement here
- **No on-site payment after a NoShow** — needs the contact retained after the rental ends:
  OQ #27 / IR-07. Separate follow-up once the lawyer answers.
- Cancellation / refund of either path — OQ #1.
- SMS verification — deferred (paid per message, new processor); revisit after the pilot.

## Scope
- [ ] ADR **D-65**: on-site payment as an attestation in Handover & Possession; D-15 (c)
      for this path; discount for online prepayment as a single Tenant policy
- [ ] Migration (expand only, D-30): payment method on ReservationGroup, on-site payment
      attestation, confirmation token, Tenant discount setting
- [ ] Checkout (S-03): choice of payment method, both prices, server-computed total
- [ ] Confirmation e-mail + confirm route (token hashed, single use, expiring)
- [ ] Limit check at checkout (normalised e-mail / phone)
- [ ] Counter: attest on-site payment (method, amount) with `<PinPrompt>`; ID capture at counter
- [ ] HandoverOut guard
- [ ] Admin: discount setting; statistics show on-site revenue on its own line (P6)
- [ ] i18n strings in app/i18n/sk.ts; money via app/utils/format.ts

## Invariants / tests
- [ ] D-08 / D-33 / D-38: unconfirmed on-site Reservations expire and release capacity like unpaid ones
- [ ] HandoverOut refused without online payment or on-site attestation
- [ ] Second active on-site group for the same e-mail or phone refused (case / format variants)
- [ ] Discount never applied to the deposit; amounts carry currency
- [ ] FR-33: limit check, attestations and settings are Tenant-scoped
- [ ] FR-34: attestation records the Operator

## Governing identifiers
P6, D-07, D-14, D-15, D-16, D-21, D-28, D-35, D-08, D-33, D-38, FR-33, FR-34, OQ #1, OQ #27, IR-07
