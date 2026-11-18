feat: Delivery and Collection — flat fee inside an Operator-maintained zone, priced by phone outside it

## Context
Client feedback 15 Nov 2026, agreed 17 Nov 2026 — see
`docs/client-feedback/2026-11-15-poziadavky-klienta.md` §3.

Supersedes A-01 (one pickup location, no delivery) and opens Logistics &
Delivery in the narrowest form Part 1 allows. Terms: **Delivery** (to the
Customer) and **Collection** (back from the Customer). Never "Order",
"Fulfilled" or "Shipment".

## Decisions (agreed with the owner)
- Delivery and Collection are independent choices (Delivery only / Collection only / both);
  every AssetType may be delivered; no minimum rental value
- Delivery on the RentalPeriod's first day, Collection on its last (day granularity,
  D-09 unchanged). Customer picks morning / afternoon; exact time agreed by phone
- No daily capacity limit for now (low expected use)
- **Zone:** Operator-maintained list of municipalities (Tenant-scoped). Customer picks one +
  enters street → **flat fee** per Delivery and per Collection, priced in checkout
- **Outside the zone:** checkbox „Chcem dovoz mimo zóny — zavolajte mi“ + free-text place.
  The ReservationGroup completes as a normal pickup; the Operator calls, then records the
  Delivery/Collection with km entered by hand; server computes **flat fee + km × rate**
- Flat fee and per-km rate are Tenant settings (money with currency, D-21)
- No maps / geocoding / routing provider; the address never leaves the platform
- The driver is an Operator with their own PIN and runs the normal HandoverOut / HandoverIn
  flow on the phone: ID, condition photos, AssetTag scan, deposit, on-site payment if any.
  Collection photos are taken at the Customer → FR-20 pairing unchanged
- In-zone fee is paid with the rental fee (online or on site); the online discount applies
  to the rental fee only
- Outside-zone fee is paid to the driver on site, cash allowed, recorded like on-site payment
  (PIN-gated attestation, amount + method — see the on-site payment issue). The eKasa receipt
  in the field is the Tenant's responsibility; the platform issues none

## Scope
- [ ] ADR **D-66**: supersede A-01; minimal Logistics & Delivery context, dependency direction
      downstream of Availability & Reservation; glossary entries Delivery / Collection
- [ ] Migration (expand only, D-30): zone municipalities, Tenant settings (flat fee, per-km rate),
      Delivery/Collection records (address, window, fee, outside-zone flag, km)
- [ ] Admin: zone list, fee settings; counter/admin list of upcoming Deliveries and Collections per day
- [ ] Checkout (S-03): choice, municipality picker, street, window, fee in the total;
      outside-zone request path
- [ ] Operator: record outside-zone Delivery/Collection (km → fee), PIN-gated
- [ ] Notification: Delivery/Collection details in the confirmation e-mail
- [ ] Privacy page: address processing (retention under OQ #27)

## Invariants / tests
- [ ] FR-33: zone, settings and Delivery/Collection records are Tenant-scoped
- [ ] Fee computed server-side only; client-sent fees ignored (D-25)
- [ ] A municipality not in the zone never gets the flat fee at checkout
- [ ] HandoverOut/HandoverIn for a Delivery/Collection still require ID, photos and scan (FR-19, FR-20)
- [ ] FR-34: Operator recorded on outside-zone pricing and on every handover
- [ ] Amounts carry currency; discount never applied to delivery fees

## Governing identifiers
A-01 (superseded), Part 1 §3 Logistics & Delivery, D-09, D-21, D-25, D-30, FR-19, FR-20, FR-33, FR-34, OQ #27, S-03
