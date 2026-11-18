feat: admin statistics — overview tiles, per-AssetType utilisation, unmet demand, CSV export

## Context
Client feedback 15 Nov 2026, agreed 16 Nov 2026 — see
`docs/client-feedback/2026-11-15-poziadavky-klienta.md` §5.

The owner wants an overview in the admin surface. Read-only over data we
already hold; no new aggregate, no domain change. Utilisation & Reporting is
`[Future]` in Part 1 — this opens it narrowly and needs a short ADR
(proposed **D-63**: read-only reporting views, no aggregate, no stored derived facts).

## Decisions (agreed with the owner)
**A) Overview (first thing on opening admin)**
1. Revenue this month vs last month
2. Utilisation % — rented days / available days, denominator is the **pool** (D-38),
   never the count currently Rentable
3. Reservations this month
4. Out now / Overdue now (Overdue derived, FR-28 — visual treatment of a derived fact)
5. Deposits currently held (cash in the drawer — attested, P6)

**B) Per-AssetType detail** for a chosen period: rentals, rented days,
utilisation, revenue; sortable "earns / sits idle"; **unmet demand** = days
the AssetType was at full capacity.

- Periods: month / year / custom range
- Simple charts only (revenue by month)
- **CSV export** for the accountant in v1
- Revenue from confirmed Payments (Stripe); any attested cash shown on its own line (P6)

**Out of scope:** asset payback / ROI (separate issue, later phase).

## Scope
- [ ] ADR D-63
- [ ] Server-side query module (read-only), Tenant-scoped; period arithmetic via
      Availability & Reservation's RentalPeriod (D-12), never inline date math
- [ ] `server/api/admin/statistics/*` routes, Zod-validated period input
- [ ] CSV export route (UTF-8 with BOM for Excel, money with currency column)
- [ ] New admin screen (proposed **S-25**, add to interface-design-foundation) + nav entry
- [ ] Money/day/period formatting via app/utils/format.ts (D-51); strings in app/i18n/sk.ts

## Invariants / tests
- [ ] FR-33: every statistic is Tenant-scoped — test with two Tenants' data
- [ ] Utilisation denominator uses the D-38 pool (Asset InPossession / UnderInspection still counts)
- [ ] Overdue/NoShow computed, never read from a stored status (FR-28)
- [ ] All amounts carry currency (D-21); no mixing of currencies in a sum
- [ ] Unmet-demand days match the availability calendar's "none" days

## Governing identifiers
FR-28, FR-33, D-38, D-21, D-12, D-51, D-20, P6, Part 1 §3 Utilisation & Reporting
