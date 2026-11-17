feat: hourly rental within one day and opening hours, with a 10-minute return tolerance

## Context
Client feedback 15 Nov 2026, agreed 17–18 Nov 2026 — see
`docs/client-feedback/2026-11-15-poziadavky-klienta.md` §1.

Today the smallest RentalPeriod is one day (A-04, D-12, D-09). The owner wants
short rentals charged per started hour. To keep the change at **L** instead of XL,
an hourly RentalPeriod never leaves one day and never leaves opening hours: days stay
the backbone, hours are intervals inside a day. **Build after the pilot launches on days.**

## Decisions (agreed with the owner)
1. **Within one day and opening hours only.** Never across midnight or closing time;
   overnight is a day rental.
2. **Opening hours** — weekly schedule as a Tenant setting, editable in admin.
   Provisional: Mon–Fri 7:00–17:00, Sat 8:00–12:00, Sun closed.
3. **Which AssetTypes:** those with an **hourly rate** set (money with currency, D-21).
   No granularity flag on AssetType (`rentalGranularity` is banned, D-12).
4. **Cap:** if the hours cost more than the day rate, the day rate is charged.
5. **Buffer** of 30 min between hourly Reservations on the same AssetType
   (inspection, photos, charging) — Tenant setting.
6. **Online:** day + start (30-min steps) + number of hours; only starts with a free
   Asset are offered. Capacity is still the D-38 pool.
7. **Charging from the reserved start.** Return is late after reserved end + **10 min**
   tolerance; then every started hour is added (12:08 → nothing, 12:15 → +1 h).
   The counter warning is a **derived** fact (FR-28, D-17), never a stored state.
8. **Surcharge** is computed by the server and taken on site (on-site payment
   attestation from the on-site payment issue). **Never deducted from the deposit** —
   deposit deductions stay damage-only with paired ConditionReports (FR-20).
9. **Day rentals unchanged:** returned any time on the last day until closing;
   the 10-min tolerance applies to hourly rentals only.
10. **Deposit** for an hourly rental equals the AssetType's day deposit — no new rule.

## Open — client
- Hourly rates per AssetType (provisional tiers only, never the Tenant's price list — OQ #29)

## Scope
- [ ] ADR **D-67**: supersede A-04 and D-12 for intra-day intervals; D-09 for hourly
      Reservations only; how RentalPeriod represents an intra-day interval; buffer rule
- [ ] Migration (expand only, D-30): hourly rate on AssetType, opening hours and buffer
      as Tenant settings, intra-day interval on Reservation
- [ ] Availability & Reservation: interval availability incl. buffer, inside opening hours,
      day-rate cap; date/time arithmetic stays in this context only
- [ ] Public: S-02 hourly picker (day, start, hours) and quote; S-03 total
- [ ] Counter: late-return warning (derived), surcharge computed server-side, taken via
      on-site payment attestation (PIN-gated)
- [ ] Admin: opening hours editor, buffer, hourly rate on AssetType
- [ ] i18n strings in app/i18n/sk.ts; times and money via app/utils/format.ts

## Invariants / tests
- [ ] **D-08 / D-33:** no overbooking with overlapping intervals, buffer included;
      concurrency proof test extended to intervals
- [ ] D-38: an hourly Reservation never reduces capacity outside its own interval + buffer
- [ ] An hourly interval outside opening hours or across days is refused
- [ ] Day-rate cap applied; surcharge = 0 within tolerance, +1 h per started hour after
- [ ] Surcharge never deducted from the deposit (FR-20)
- [ ] Late return is derived, never stored (FR-28)
- [ ] FR-33: opening hours, rates and Reservations Tenant-scoped; FR-34 on surcharge attestation

## Governing identifiers
A-04, D-12, D-09 (superseded for hourly), D-08, D-17, D-21, D-30, D-33, D-38, FR-20, FR-28, FR-33, FR-34, OQ #29, S-02, S-03
