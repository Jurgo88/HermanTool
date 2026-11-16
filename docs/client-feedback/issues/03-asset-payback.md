feat (later phase): asset payback — revenue per Asset vs purchase price and servicing cost

## Context
Client feedback 15 Nov 2026, deferred to a later phase on 16 Nov 2026 — see
`docs/client-feedback/2026-11-15-poziadavky-klienta.md` §5.

**Not for the pilot.** Parked here so it is not lost. Depends on the admin
statistics issue.

## What it needs (to be designed when picked up)
- New data: purchase price + date per Asset (with currency, D-21); servicing costs
  — the latter touches Maintenance & Servicing, `[Future]` in Part 1
- Revenue attribution to an Asset: Reservations bind to an AssetType (D-04);
  the Asset is known only from the RentalAgreement at HandoverOut — define how
  a group Payment splits across Assets
- ADR before implementation

## Open questions for the owner
- Purchase prices available for the existing ~200 Assets?
- Track servicing costs in the system at all, or only purchase price?

## Governing identifiers
D-04, D-21, FR-33, Part 1 §3 Maintenance & Servicing / Utilisation & Reporting
