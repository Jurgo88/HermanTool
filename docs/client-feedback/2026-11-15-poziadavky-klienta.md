# Požiadavky klienta — 15. 11. 2026

Stav: **na prediskusiu** — nič z tohto zatiaľ nie je rozhodnuté ani naplánované.
Ku každej požiadavke: čo klient chce, ako to sedí s architektúrou (čo by
sa menilo), otázky na klienta a hrubý odhad náročnosti.

Odhad: **S** = dni · **M** = 1–2 týždne · **L** = 2–4 týždne · **XL** = mení jadro systému

---

## Prehľad

| # | Požiadavka | Náročnosť | Mení architektonické rozhodnutie? | Blokuje to niečo mimo vývoja? |
|---|---|---|---|---|
| 1 | Prenájom na hodiny + 10 min tolerancia | **XL** | Áno — A-04, D-12, D-09 | Cenník po hodinách |
| 2 | Platba v hotovosti na mieste s príplatkom | **L** | Áno — Payments, D-14 | Účtovník / právnik (eKasa, príplatok) |
| 3 | Dovoz náradia (paušál + €/km) | **L** | Áno — A-01, Logistics & Delivery | Cenník, kto vozí |
| 4 | Stripe účet pre spoločnosť | **S** | Nie (Stripe účet Tenanta, Part 4) | Dokumenty firmy, KYC |
| 5 | Štatistiky v admine ✅ | **M** | Áno — Utilisation & Reporting je `[Future]` (krátke ADR, read-only) | Nie |
| 6 | AI odporúčanie náradia podľa popisu problému ✅ | **M** | Nový dodávateľ + záznam otázok (ADR D-64) | Spracovateľská zmluva, Súkromie |
| 7 | Kompatibilné náradie k rezervácii jedným klikom ✅ | **M** | Nový pojem CompatibleAssetType (ADR), invarianty bez zmeny | Nie |

---

## 1. Prenájom na hodiny

**Čo klient chce**
- Prenájom aj na hodiny, minimum 1 hodina.
- Účtuje sa každá **začatá** hodina.
- Systémová tolerancia **10 minút** pri vrátení.
- Ak zákazník vráti po tolerancii, systém **upozorní pracovníka na pulte**.

**Vzťah k architektúre**
- Toto je najväčší zásah zo všetkých. Pilot je postavený na **dňoch**
  (A-04: „minimum rental is one whole day“). D-12 hodinový prenájom
  výslovne predvída ako budúce rozšírenie, ale **nepripravuje ho** —
  dostupnosť je množina kalendárnych dní, nie intervaly na časovej osi.
- Čo sa musí zmeniť: RentalDay → RentalUnit, RentalPeriod ako interval
  (od–do s časom), výpočet dostupnosti po intervaloch, čas na obrátku
  medzi dvoma prenájmami (D-09 dnes „spotrebuje“ celý deň vrátenia),
  letný/zimný čas (pri dňoch ho ignorujeme, pri hodinách nie).
- Overbooking invariant (D-08) a súbežnosť (D-33) sa musia prerobiť
  a znova otestovať na intervaloch.
- Dobrá správa: vďaka D-12 je dátumová aritmetika na jednom mieste
  (Availability & Reservation), takže zmena je sústredená do jedného kontextu.
- **Tolerancia + upozornenie** sedí s existujúcim modelom pekne: Overdue
  je odvodený, nikdy uložený (FR-28), a D-17 už počíta s „derived Operator
  view“. Tolerancia = jedna pomenovaná hodnota politiky. Upozornenie na
  pulte = zobrazenie odvodeného faktu, nie nový stav.
- Pozor: **poplatky za oneskorenie sú dnes vedome nerozhodnuté** (Part 1,
  D-17). Ak „po tolerancii“ znamená aj doúčtovanie, je to nová politika.

**Otázky na klienta**
- Ktoré náradie sa bude dať požičať na hodiny? (Všetko, alebo len ručné
  elektrické náradie?)
- Hodinová sadzba pre každé náradie zvlášť, alebo % z dennej?
- Strop: od koľkých hodín sa účtuje denná sadzba namiesto hodinovej?
- Otváracie hodiny — prenájom len v rámci nich? Čo cez noc?
- Koľko času treba medzi dvoma hodinovými prenájmami toho istého kusu
  (kontrola, fotky, nabitie batérie)?
- Platí 10 min tolerancia aj pre denné prenájmy?
- Po tolerancii: len upozornenie, alebo aj doúčtovanie ďalšej hodiny?
  Ak doúčtovanie — kartou dodatočne, alebo hotovosťou na pulte?
- Záloha pri hodinovom prenájme rovnaká ako pri dennom?

**Náročnosť: XL.** Odporúčam robiť až po spustení pilotu na dňoch
a s vlastným ADR, ktoré nahradí D-12 / A-04 / D-09.

---

## 2. Platba v hotovosti na mieste s príplatkom

**Čo klient chce**
- Možnosť zaplatiť nájomné hotovosťou pri prevzatí.
- S príplatkom, aby ľudia uprednostnili kartu. (Klient to ešte chce doladiť.)

**Vzťah k architektúre**
- Dnes Payments = **iba online platba nájomného cez Stripe**. Hotovosť
  existuje len pri zálohe a systém ju iba zaznamenáva (P6, D-07).
- Rezervácia sa dnes potvrdí až po zaplatení. Pri hotovosti by vznikla
  **potvrdená, ale nezaplatená** rezervácia, ktorá blokuje kapacitu —
  riziko NoShow bez akejkoľvek straty pre zákazníka. Treba pravidlo
  (napr. expirácia, limit, len pre overených zákazníkov).
- **Doklad totožnosti (D-14):** fotka dokladu sa nahráva až po platbe,
  lebo pred platbou nie je právny základ ju držať. Pri hotovosti sa
  tento okamih posúva — buď sa doklad overí až na pulte, alebo treba
  nový právny základ. Súvisí s rozhodnutím D-61 / retenciou.
- Pomerne čisté riešenie: rovnaký vzor ako záloha — systém zaznamená
  „Operator potvrdil prijatie hotovosti“ (atestácia s PIN, D-16, F8),
  nepredstiera, že platbu spracoval.

**Na preverenie mimo vývoja (účtovník / právnik)**
- **eKasa:** prijímanie hotovosti za služby na Slovensku vyžaduje
  registračnú pokladnicu eKasa. Má ju klient? Systém by doklad z eKasy
  nevydával, len evidoval.
- **Príplatok za hotovosť:** overiť, či je to prípustné a ako to uviesť
  v predzmluvných informáciách (súvisí s OQ #1 — obchodné podmienky).
  Alternatíva, ktorá býva bezpečnejšia: **zľava pri online platbe kartou**.

**Otázky na klienta**
- Výška príplatku — pevná suma alebo %?
- Môže si hotovosťou zarezervovať ktokoľvek, alebo len vracajúci sa zákazník?
- Čo ak zákazník s hotovostnou rezerváciou nepríde?
- Doúčtovanie (napr. hodiny po tolerancii) — tiež hotovosťou?

**Náročnosť: L** + rozhodnutia účtovníka/právnika pred začatím.

---

## 3. Dovoz náradia

**Čo klient chce**
- Doplnková služba: dovoz náradia do blízkeho okolia.
- V definovanej oblasti **paušálna suma**, mimo nej **suma za km**.

**Vzťah k architektúre**
- Pilot predpokladá jedno výdajné miesto a žiadny dovoz (A-01).
  Logistics & Delivery je v Part 1 vedené ako `[Future]` kontext a
  doručovanie je výslovne medzi non-goals pilotu. Treba ADR.
- Odovzdanie sa dnes deje **na pulte**: overenie totožnosti, fotky stavu,
  hotovostná záloha, sken QR. Pri dovoze sa to deje **u zákazníka** —
  PWA na telefóne to zvládne, ale treba vyriešiť zálohu v teréne
  a kto má telefón (per-Operator PIN už máme).
- Výpočet km: vzdušná vzdialenosť je zadarmo, cestná vyžaduje mapové
  API (nový dodávateľ, náklady, adresa zákazníka = ďalší osobný údaj
  s retenciou — súvisí s IR-07 / OQ #27).

**Otázky na klienta**
- Ako je definovaná oblasť paušálu? (Polomer X km od prevádzky,
  zoznam obcí/PSČ?)
- Výška paušálu a sadzba za km. Počíta sa km tam aj späť?
- Zahŕňa to aj **odvoz** po skončení prenájmu?
- Kto vozí a kedy — časové okná? Kapacitné obmedzenie (jedno auto)?
- Platí sa doprava online spolu s nájomným?

**Náročnosť: L.** Základná verzia (paušál podľa zoznamu obcí, adresa,
termín) je výrazne lacnejšia ako plne automatický výpočet km.

---

## 4. Stripe účet pre spoločnosť

**Čo treba**
- Architektúra už počíta so **Stripe účtom Tenanta** (nie mojím) — je to
  zámerne, peniaze idú priamo klientovi a fungujú aj bezo mňa (Part 4,
  riziko „jeden človek“).

**Checklist**
- [ ] Klient si účet založí **sám** na firmu (IČO, výpis z registra,
      IBAN, doklad konateľa, KYC) — ja dostanem prístup ako developer.
- [ ] Doplniť obchodné údaje, popis na výpise, podporný e-mail.
- [ ] Live kľúče + webhook secret do Netlify env (nikdy do repa).
- [ ] Nastaviť webhook endpoint na produkčnú doménu.
- [ ] Testovacia platba a refund v live režime.
- [ ] Pozn.: refundy/storno stále čakajú na OQ #1 (storno podmienky).

**Náročnosť: S** (väčšinou na strane klienta).

---

## 5. Štatistiky v admin menu

**Čo klient chce**
- Prehľad / štatistiky pre majiteľa v administrácii.

**Vzťah k architektúre**
- Utilisation & Reporting je v Part 1 vedené ako `[Future]`. Technicky
  je to ale lacné: iba čítanie, odvodené z dát, ktoré už máme
  (rezervácie, odovzdania, platby, zálohy, stav kusov). Nemení doménu.
- Pozor na rozdiel uložené vs. odvodené (FR-28) a na to, že hotovosť
  (záloha, prípadne nájomné z bodu 2) systém iba eviduje.

### ✅ Prediskutované 16. 11. 2026 — dohodnuté

**A) Úvodný prehľad (po otvorení adminu)**
1. Tržby za tento mesiac oproti minulému.
2. Vyťaženosť náradia v % — prenajaté dni / dni, keď mohlo byť vonku
   (menovateľ = pool podľa D-38, nie počet kusov práve Rentable).
3. Počet rezervácií tento mesiac.
4. Práve vonku / po termíne (Overdue je odvodený, FR-28).
5. Zálohy práve prijaté (hotovosť v šuplíku).

**B) Detail po typoch náradia** za zvolené obdobie
- Počet prenájmov, prenajaté dni, vyťaženosť, tržba.
- Zoradenie „čo zarába / čo leží“.
- **Nenaplnený dopyt:** dni, keď bol typ vypredaný.

**Rozhodnutia**
- Obdobia: mesiac / rok / vlastný rozsah.
- Grafy len jednoduché (tržby po mesiacoch).
- **Export do CSV** pre účtovníka hneď v prvej verzii.
- Tržby z potvrdených platieb (Stripe); hotovosť (ak príde bod 2)
  samostatným riadkom, lebo systém ju iba eviduje (P6).
- Peniaze vždy s menou (D-21), formátovanie cez app/utils/format.ts.
- Dátumové výpočty (obdobia, vyťaženosť) na serveri v Availability &
  Reservation, nie v UI.

**Neskoršia fáza:** návratnosť kusu (tržba vs. kúpna cena, servisné
náklady) — vyžaduje evidenciu nákupných cien a nákladov, nový údaj
aj obrazovku.

**Architektúra:** iba čítanie, nemení doménu. Utilisation & Reporting
je v Part 1 `[Future]` → krátke ADR, že sa otvára v rozsahu read-only
prehľadov bez vlastného agregátu. Všetky dotazy Tenant-scoped (FR-33).

**Náročnosť: M.**

---

## 6. AI odporúčanie náradia

**Čo klient chce**
- Zákazník napíše svoj problém („potrebujem vyvŕtať dieru do betónu
  na poličku“) a systém mu odporučí náradie z ponuky.

### ✅ Prediskutované 17. 11. 2026 — dohodnuté

**Rozsah**
- Pole nad katalógom (S-01) „Opíšte, čo potrebujete urobiť“; bežné filtre
  (D-54) ostávajú vedľa.
- Výsledok: 1–3 typy náradia + jedna veta zdôvodnenia, prípadne
  bezpečnostná poznámka. **Žiadny postup práce** (riziko zodpovednosti).
- Klik vedie na S-02; dostupnosť sa v AI výsledku neukazuje (D-58).
- Model smie vrátiť iba ID publikovaných AssetTypes; server to overí.
  Ak nevie poradiť → „S týmto vám poradíme osobne“ + kontakt.
- Volanie iba zo servera, kľúč nikdy v prehliadači (D-25).

**Limity**
- Na návštevníka: **10 otázok / hodinu, 30 / deň**. Návštevník nie je
  Customer (Part 2), preto kľúčom je hash IP s denne meneným kľúčom,
  zahodený po 24 h — IP sa neukladá v čitateľnej podobe.
- Max. dĺžka otázky **500 znakov**.
- **Mesačný strop 10 €** pre Tenanta, meniteľný v admine. Každé volanie
  zapíše spotrebu tokenov; po dosiahnutí stropu sa pole do konca mesiaca
  skryje a ostanú filtre.
- Ochrana proti robotom (napr. Turnstile) až keď bude treba.

**Ukladanie otázok**
- Text otázky + odporúčané AssetTypes + čas. Bez IP, bez väzby na Customer.
- Pred uložením sa automaticky odstránia e-maily a telefónne čísla.
- **Retencia 90 dní**, oprávnený záujem — zaznamenať ako D-61
  a doplniť stránku Súkromie.
- V štatistikách (bod 5): „Čo ľudia hľadali“, zvlášť otázky bez nájdeného
  náradia (chýbajúca ponuka).

**Koľko otázok pokryje 10 €** (ceny Anthropic API k 3. 11. 2026, v USD;
odhad ~4 000 vstupných tokenov — katalóg ~44 typov + inštrukcie —
a ~500 výstupných vrátane premýšľania na otázku):

| Model | Cena / otázka | Otázok za ~10 € |
|---|---|---|
| Claude Haiku 5.5 | ~0,0007 $ | **~15 000** |
| Claude Sonnet 5.5 | ~0,013 $ | ~800 |
| Claude Opus 5.5 | ~0,026 $ | ~400 |

Navrhnutý **Haiku 5.5** (výber z ~44 položiek je jednoduchá úloha);
pred spustením overiť na ~30 vzorových slovenských otázkach, pri slabej
kvalite prejsť na Sonnet 5.5. Presné čísla po prvom meraní reálnej spotreby.

**Architektúra:** nový dodávateľ + záznam návštevníckych otázok
(odchýlka od Part 2 „Visitor nezanecháva záznam“) → ADR (navrhnuté
**D-64**), spracovateľská zmluva (OQ #4).

**Náročnosť: M.**

---

## 7. Kompatibilné náradie k rezervácii

**Čo klient chce**
- Pri rezervácii ponúknuť kompatibilné náradie.
- Jedným klikom ho pridať do tej istej rezervácie **na rovnaký termín**.
- Ak nie je v daný termín voľné, systém to oznámi a **ponúkne iné termíny**.

### ✅ Prediskutované 16. 11. 2026 — dohodnuté

**Čo „kompatibilné“ znamená:** samostatne požičiavateľné náradie, ktoré
systém **iba odporučí**. Príklad: nadstavec sa pripája k wapke; zákazník
si požičia nadstavec a systém mu ukáže wapku — ak ju má doma, ignoruje to.
**Nie je to Accessory (D-57).** Accessory ostáva tak, ako je.

| | Accessory (D-57, existuje) | CompatibleAssetType (nové) |
|---|---|---|
| Dá sa požičať samostatne | nie | **áno** |
| Zobrazuje sa v katalógu (S-01) | nie, len pri hlavnom | **áno**, normálne |
| Checkout bez druhého náradia odmietne | áno | **nie — iba odporúčanie** |

**Rozhodnutia**
1. **Pojem:** `CompatibleAssetType` (väzba „kompatibilné s“). V UI
   „Hodí sa k tomu“ / „Kompatibilné náradie“. Nový pojem v Ubiquitous
   Language → zapísať do ADR (nadväzuje na §16.4).
2. **Väzba je obojsmerná:** jedna väzba v admine sa zobrazí na oboch
   stranách (pri nadstavci wapka, pri wapke nadstavce). Udržiava ju
   Operator ručne v admine; Tenant-scoped (FR-33).
3. **Kde sa ponúka:** na stránke náradia (S-02) pod kalendárom —
   názov, cena za deň, tlačidlo „Pridať na rovnaký termín“. Pridanie
   = ďalšia Reservation v tom istom ReservationGroup (D-13 to dovoľuje,
   skupina nemá vlastný RentalPeriod).
4. **Keď kompatibilné náradie nie je voľné:** systém to oznámi a ponúkne
   **najbližšie termíny, kedy sú voľné obe**; zákazník môže presunúť celú
   rezerváciu. Pridať kompatibilné náradie na **iný** termín sa neponúka.
5. **„Ostatní si k tomu požičiavajú“ (automaticky zo štatistík) — teraz nie.**
   Pri pilotnom objeme by bola náhodná; prípadne neskôr nad bodom 5.

**Architektúra:** žiadna zmena invariantov — dostupnosť, záloha, D-08,
D-33, D-38 platia bez zmeny, lebo kompatibilné náradie je obyčajný
AssetType. Nové je: väzba v Catalog, admin obrazovka na správu väzieb,
blok na S-02, serverový dotaz „najbližšie termíny voľné pre oba typy“
(dátumová aritmetika v Availability & Reservation, D-12).

**Otvorené:** konkrétne dvojice zadá klient v admine po nasadení.

**Náročnosť: M.**

---

## Návrh poradia (na diskusiu)

1. **Stripe účet (4)** — blokuje spustenie, väčšinou práca klienta.
2. **Kompatibilné náradie (7)** — stavia na hotovom D-57, rýchly prínos.
3. **Štatistiky (5)** — len čítanie, bez zásahu do domény.
4. **AI odporúčanie (6)** — samostatné, dá sa pustiť postupne.
5. **Hotovosť (2)** — až po odpovedi účtovníka (eKasa, príplatok).
6. **Dovoz (3)** — až po ujasnení oblasti, cenníka a kto vozí.
7. **Hodinový prenájom (1)** — najväčší zásah; po spustení pilotu
   na dňoch, s vlastným ADR.

## Čo treba od klienta pred ďalším krokom

- Odpovede na otázky pri jednotlivých bodoch.
- Rozhovor s účtovníkom: eKasa, príplatok za hotovosť.
- Rozhovor s právnikom (už prebieha pre OQ #1 / #27): storno podmienky,
  príplatok, adresa pri dovoze, AI a voľný text zákazníka.
- Hodinové sadzby, paušál a sadzba za km pre dovoz.
