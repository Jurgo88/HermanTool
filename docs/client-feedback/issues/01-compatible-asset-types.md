feat: CompatibleAssetType — suggest standalone compatible tools on S-02, add on the same dates in one click

## Context
Client feedback 15 Nov 2026, agreed 16 Nov 2026 — see
`docs/client-feedback/2026-11-15-poziadavky-klienta.md` §7.

A Customer renting e.g. a surface-cleaner attachment should be shown the
pressure washer it connects to — but the washer is **standalone** and the
Customer may already own one, so it is a suggestion, never a requirement.

This is **not** an Accessory (D-57) and must not change D-57:

| | Accessory (D-57) | CompatibleAssetType (new) |
|---|---|---|
| Rentable on its own | no | **yes** |
| Listed in S-01 | no | **yes** |
| Checkout refuses without the other | yes | **no — suggestion only** |

## Decisions (agreed with the owner)
1. New Ubiquitous Language term **CompatibleAssetType** (link "compatible with").
   UI copy: „Hodí sa k tomu“. Needs an ADR (proposed **D-62**, Part 4 §16.4
   follow-up) and a glossary entry. Never "related product", option, variant, extra.
2. The link is **symmetric**: one link, shown on both AssetTypes' S-02 pages.
   Catalog data, Tenant-scoped, Operator-maintained in the admin surface.
3. Offered on **S-02** below the calendar: name, day rate, „Pridať na rovnaký termín“.
   Adding = one more Reservation in the same ReservationGroup with the same
   RentalPeriod (D-13 — the group carries no RentalPeriod of its own).
4. If the compatible AssetType is not available for the chosen period, say so
   and offer the **nearest periods when both are available**; the Customer may
   move the whole selection. Adding it on a *different* period is not offered.
5. "Others also rent…" derived from history — **out of scope** (pilot volume too low).

## Scope
- [ ] ADR D-62 + glossary entry (Part 1 UL table, Part 4 §16.4 log)
- [ ] Migration (expand only, D-30): link table `(tenant_id, asset_type_a_id, asset_type_b_id)`,
      canonical ordering so a pair is stored once; no self-link; both AssetTypes same Tenant
- [ ] Catalog: add / remove link, list compatible AssetTypes of an AssetType (published only on public side)
- [ ] Admin (S-19 catalog editor): manage compatible AssetTypes, searchable picker
- [ ] Public API: compatible AssetTypes for S-02 (published only)
- [ ] Availability & Reservation: "nearest periods where AssetType X and Y both have capacity"
      for a given RentalPeriod length — date arithmetic stays in this context (D-12)
- [ ] S-02 block + one-click add; unavailable state with suggested periods; four states on the control
- [ ] i18n strings in app/i18n/sk.ts only (D-20)

## Invariants / tests
- [ ] FR-33: links never cross Tenants; public read never returns another Tenant's or an unpublished AssetType
- [ ] Checkout does **not** require the compatible AssetType (contrast test with D-57's accessory rule)
- [ ] D-08 / D-38 unchanged: adding the compatible Reservation goes through the normal hold path
- [ ] Symmetry: link created from either side is visible from both; duplicate pair refused
- [ ] Nearest-periods query never proposes a period where either AssetType is over capacity

## Governing identifiers
D-13, D-57 (unchanged), D-08, D-33, D-38, D-12, D-25, D-30, FR-33, D-54, D-58, S-02, S-19
