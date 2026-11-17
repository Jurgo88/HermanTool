feat: optional marketing consent at checkout, recorded with version and withdrawable

## Context
Client feedback 15 Nov 2026, agreed 17 Nov 2026 — see
`docs/client-feedback/2026-11-15-poziadavky-klienta.md` §5 („Zákazníci“).

The owner wants to offer discounts to regular Customers later. Marketing
e-mail needs a lawful basis; collecting an explicit opt-in now means there is
someone to write to once offers exist. Accounts stay out of scope (D-14).

## Decisions (agreed with the owner)
- Unticked checkbox on checkout (S-03): „Chcem dostávať ponuky a zľavy e-mailom“ (copy in app/i18n/sk.ts)
- Store: given yes/no, timestamp, consent text version — same pattern as terms acceptance (D-35)
- Withdrawal: unsubscribe link (tokenised, no login) in every marketing e-mail; withdrawal recorded with timestamp
- No marketing e-mail is sent in this issue — only the consent is captured and withdrawable
- Transactional e-mails (confirmation, reminders) are unaffected

## Open — lawyer (with OQ #27)
- Retention of a consent record and of the e-mail it covers (until withdrawn? plus proof period)
- Whether existing Customers may be contacted on an opt-out basis without this consent

## Scope
- [ ] Migration (expand only, D-30): consent fields / consent record, Tenant-scoped
- [ ] Checkout UI + Zod validation; server records consent with the ReservationGroup's Customer
- [ ] Unsubscribe route + page (S-xx to assign), token hashed, idempotent
- [ ] Privacy page (sukromie.vue) section on marketing consent
- [ ] Admin: count of Customers with active consent (no list until OQ #27)

## Invariants / tests
- [ ] Default is no consent; a missing field never records consent
- [ ] Withdrawal is recorded and wins over earlier consent for the same contact
- [ ] FR-33: consent records are Tenant-scoped
- [ ] Consent text version stored matches the version shown

## Governing identifiers
D-14, D-35, D-20, D-28, FR-33, P7, OQ #27, IR-07, S-03
