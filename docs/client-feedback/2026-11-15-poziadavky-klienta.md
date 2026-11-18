# Požiadavky klienta — 15. 11. 2026

Stav: **na prediskusiu** — nič z tohto zatiaľ nie je rozhodnuté ani naplánované.
Ku každej požiadavke: čo klient chce, ako to sedí s architektúrou (čo by
sa menilo), otázky na klienta a hrubý odhad náročnosti.

Odhad: **S** = dni · **M** = 1–2 týždne · **L** = 2–4 týždne · **XL** = mení jadro systému

---

## Prehľad

| # | Požiadavka | Náročnosť | Mení architektonické rozhodnutie? | Blokuje to niečo mimo vývoja? |
|---|---|---|---|---|
| 1 | Prenájom na hodiny (v rámci dňa) + 10 min tolerancia ✅ | **L** | Áno — nahrádza D-12, A-04, D-09 (ADR D-67) | Hodinové sadzby |
| 2 | Platba na mieste (eKasa) + zľava za online ✅ | **L** | Áno — atestácia platby, D-15 (c), ADR D-65 | Výška zľavy; zákaz po NoShow čaká na OQ #27 |
| 3 | Dovoz a odvoz (zóna = paušál, mimo = paušál + km ručne) ✅ | **M–L** | Áno — ruší A-01, ADR D-66 | Paušál, sadzba za km, zoznam obcí |
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

### ✅ Prediskutované 17. 11. 2026 — dohodnuté (s otvorenými bodmi)

**Rozhodnutia, ktoré zjednodušujú zásah**
1. **Hodinový prenájom len v rámci jedného dňa a otváracích hodín.**
   Nikdy cez polnoc ani cez zatváraciu hodinu; cez noc = denný prenájom.
   Dni ostávajú základom, hodiny sú intervaly v rámci dňa → odpadá
   letný/zimný čas a väčšina prerábky kalendára.
2. **Otváracie hodiny** — týždenný rozvrh v admine, ľahko upraviteľný
   (Tenant setting). Predbežne: **Po–Pi 7:00–17:00, So 8:00–12:00,
   Ne zatvorené** — klient upraví v admine.
3. **Ktoré náradie:** to, ktoré má vyplnenú **hodinovú sadzbu** (samostatná
   suma pri AssetType, nastavuje Operator). Žiadny prepínač
   denné/hodinové — žiadne `rentalGranularity` (D-12, banned term).
4. **Strop:** ak hodiny vyjdú drahšie ako denná sadzba, účtuje sa denná.
5. **Prestávka 30 min** medzi hodinovými prenájmami toho istého typu
   (kontrola, fotky, nabitie) — hodnota v admine.
6. **Online:** deň + začiatok (po 30 min) + počet hodín; ponúkajú sa len
   časy s voľným kusom. Kus vonku na celý deň sa na hodiny neponúkne.
   Kapacita stále podľa poolu (D-38).
7. **Účtovanie:** od **rezervovaného začiatku**. Vrátenie = rezervovaný
   koniec + **10 min tolerancia**; potom každá začatá hodina navyše
   (12:08 → nič, 12:15 → +1 h). Upozornenie na pulte = odvodený fakt
   (FR-28, D-17), nie uložený stav.
8. **Doplatok** vyráta systém, pracovník ho prijme na mieste (mechanizmus
   z bodu 2). **Nestrháva sa zo zálohy** — zrážka zo zálohy len pri
   poškodení s párovými ConditionReports (FR-20).

9. **Denný prenájom bez zmeny:** vracia sa kedykoľvek v posledný deň do
   konca otváracích hodín; 10 min tolerancia sa týka len hodinových.
10. **Záloha** pri hodinovom prenájme je rovnaká ako pri dennom (hodnota
    pri AssetType, žiadne nové pravidlo).

**Otvorené u klienta:** hodinové sadzby pre jednotlivé AssetTypes.

**Architektúra:** ADR nahradí D-12 (RentalPeriod dostane časové
intervaly v rámci dňa), A-04 (minimum = 1 deň) a pre hodinové prenájmy
D-09. D-08 a D-33 (overbooking, súbežnosť) sa musia rozšíriť na
intervaly a znova otestovať. Navrhnuté **D-67**.

**Náročnosť: L** (vďaka obmedzeniu na jeden deň, inak XL). Robiť až
po spustení pilotu na dňoch.

---

## 2. Platba v hotovosti na mieste s príplatkom

**Čo klient chce**
- Možnosť zaplatiť nájomné hotovosťou pri prevzatí.
- S príplatkom, aby ľudia uprednostnili kartu. (Klient to ešte chce doladiť.)

### ✅ Prediskutované 17. 11. 2026 — dohodnuté (okrem bodov blokovaných právnikom)

**Zmena zadania: „platba na mieste“, nie „hotovosť s príplatkom“**
- Zákazník si pri rezervácii vyberie **online vopred** (Stripe) alebo
  **na mieste**. Na mieste platí cez klientovu **eKasu** — hotovosť,
  karta na termináli alebo QR kód. Klient eKasu má; systém doklad
  nevydáva, iba zaznamenáva.
- **Namiesto príplatku zľava za platbu online vopred** — % z nájomného,
  výšku dohodne klient. Jedna hodnota v admine (Tenant setting), nie
  cenníkový systém (Pricing & Promotions ostáva `[Future]`). Len nájomné,
  nie záloha. Zobrazenie: „25 €/deň · pri platbe online 22,50 €“; konečná
  suma vypočítaná na serveri a viditeľná pred odoslaním. Karta na termináli
  na pulte zľavu nemá.

**Rozhodnutia**
1. **Zaznamenanie platby:** pracovník na pulte potvrdí s PIN-om (D-16,
   F8) prijatie nájomného — suma s menou (D-21) a forma (hotovosť /
   karta / QR). Systém peniaze nespracúva (P6, rovnaký vzor ako záloha D-07).
2. **HandoverOut odmietne** skupinu, ktorej nájomné nie je zaplatené
   online ani potvrdené na mieste (rovnaký vzor ako súhlas s podmienkami, D-35).
3. **Limit: max. 1 aktívna rezervácia s platbou na mieste na kontakt** —
   zhoda na normalizovanom e-maile **alebo** telefóne. Bez kont (D-14).
4. **Potvrdenie e-mailom:** rezervácia na mieste sa potvrdí až po kliknutí
   na odkaz v e-maile (Resend, D-28); dovtedy drží kapacitu len ako dnešná
   pending rezervácia (`pending_expires_at`). SMS overenie — pozri nižšie.
5. **Doklad totožnosti** pri platbe na mieste fotí **pracovník na pulte**
   pri prevzatí (D-15 možnosť (c)); online sa pri nej nič nenahráva.
6. NoShow uvoľní zvyšok obdobia; pripomienkový e-mail deň vopred.

**⚠️ Blokované na OQ #27 (retencia údajov zákazníka, IR-07)**
- **Zákaz platby na mieste po NoShow** — systém si musí kontakt pamätať
  aj po skončení rezervácie.
- **Klient chce uchovávať kontakty všetkých, ktorí si niečo požičali** —
  kvôli dodatočným reklamáciám/nárokom a štatistikám. Toto je **vstup
  pre právnika**, nie hotové rozhodnutie: GDPR vyžaduje konkrétnu dobu
  a právny základ (P7), „navždy“ nie je možné. Návrh na posúdenie:
  kontakt držať po dobu premlčania možných nárokov (oprávnený záujem —
  obrana právnych nárokov), potom **anonymizovať**; štatistiky pracujú
  s anonymizovanými dátami a osobné údaje nepotrebujú. Marketing by
  vyžadoval samostatný súhlas.

**SMS overenie (voliteľné, neskôr):** nie je zadarmo — platí sa za každú
SMS (rádovo centy). Pri pilotnom objeme by to boli jednotky € mesačne,
ale je to nový dodávateľ (ADR, spracovateľská zmluva). Zatiaľ len e-mail;
rozhodnúť po pilote podľa toho, či sa limit obchádza.

**Architektúra:** Payments zostáva „online platba nájomného“; platba na
mieste je atestácia v Handover & Possession ako záloha → ADR (navrhnuté
**D-65**). Zľava za online = jedna politika Tenanta, nie pricing engine.

**Otvorené u klienta:** výška zľavy v %.

**Náročnosť: L.**

---

## 3. Dovoz náradia

**Čo klient chce**
- Doplnková služba: dovoz náradia do blízkeho okolia.
- V definovanej oblasti **paušálna suma**, mimo nej **suma za km**.

### ✅ Prediskutované 17. 11. 2026 — dohodnuté

**Rozsah**
- **Dovoz aj odvoz**, ako samostatné možnosti (len dovoz / len odvoz /
  oboje). Doviezť sa dá **všetko** náradie, bez minimálnej sumy.
- Dovoz v prvý deň RentalPeriod, odvoz v posledný (dni, D-09 bez zmeny).
  Zákazník vyberie dopoludnia / popoludní, presný čas dohodne vodič
  telefonicky.
- **Bez denného limitu dovozov** — na začiatku sa nepočíta s častým
  využitím. Limit doplniť, keď bude treba.

**Cena — bez mapových služieb**
- Operator v admine spravuje **zoznam obcí v zóne**. Zákazník vyberie
  obec zo zoznamu a dopíše ulicu → **paušál**, cena hneď v checkoute.
- **Mimo zóny (možnosť c):** zákazník zaškrtne „Chcem dovoz mimo zóny —
  zavolajte mi“ a napíše obec/adresu. Rezervácia sa dokončí normálne;
  pracovník zavolá, dohodne cenu a zapíše dovoz. Cena = **paušál + km ×
  sadzba**, km zadá pracovník (systém vyráta sumu). Paušál a sadzba sú
  hodnoty v admine.
- Žiadne automatické km z adresy, žiadny externý dodávateľ, adresa
  neodchádza tretej strane.

**Odovzdanie u zákazníka**
- Vodič je Operator so svojím PIN-om a robí na telefóne (PWA) to isté
  čo na pulte: doklad, fotky stavu, sken AssetTag, záloha, prípadne
  platba na mieste. Pri odvoze fotky stavu u zákazníka → FR-20 párové
  ConditionReports platia bez výnimky.

**Platba**
- Doprava v zóne sa platí spolu s nájomným (online alebo na mieste).
  Zľava za online platbu sa týka len nájomného.
- Doprava mimo zóny (cena známa až po telefonáte) — **platí sa na mieste
  vodičovi, aj v hotovosti**; vodič ju zaznamená rovnako ako platbu na
  mieste z bodu 2 (PIN, suma, forma). Pokladničný doklad z eKasy je
  na strane klienta (overiť s účtovníkom, ako ho vydať v teréne).

**Architektúra:** ruší A-01 (jedno výdajné miesto bez dovozu); otvára
Logistics & Delivery v minimálnom rozsahu — pojmy **Delivery**
a **Collection** (Part 1), nie „Order“ / „Fulfilled“ → ADR (navrhnuté
**D-66**). Adresa zákazníka = ďalší osobný údaj pod OQ #27.

**Náročnosť: M–L.**

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

**Zákazníci — doplnené 17. 11. 2026**

Klient chce vidieť štatistiky aj po zákazníkoch (kto si požičiava
pravidelne), aby mu mohol ponúknuť zľavu alebo odpustiť zálohu.

- **Súhlas s ponukami — hneď.** Nezaškrtnuté políčko v checkoute
  „Chcem dostávať ponuky a zľavy“. Uloží sa súhlas s časom a verziou
  textu; odvolanie odkazom v každom e-maile. Bez súhlasu žiadne
  marketingové e-maily (či stačí pri existujúcich zákazníkoch možnosť
  odhlásenia, posúdi právnik).
- **História zákazníka v admine — po odpovedi na OQ #27.** Zoskupenie
  podľa normalizovaného e-mailu/telefónu (záznam Customer je dnes na
  každú rezerváciu, D-14 sa nemení): počet prenájmov, útrata, posledná
  návšteva, NoShow, poškodenia. Nový účel spracúvania → otázka pre
  právnika; „nie CRM“ (Part 1) → zapísať v ADR.
- **Odpustenie/zníženie zálohy — neskôr, ručne.** Pracovník pri
  HandoverOut s PIN-om a dôvodom; automatické pravidlá až podľa skúseností.
  Riziko: bez zálohy niet z čoho strhnúť pri poškodení.
- **Zľava pre stáleho zákazníka** — ručne na pulte vs. automaticky
  (kód v e-maile): **otvorené**.
- **Prihlásení zákazníci (kontá) — v budúcnosti áno.** Zatiaľ ostáva
  rezervácia bez registrácie (D-14), lebo je jednoduchšia pre zákazníka.
  Kontá budú vyžadovať nové rozhodnutie nahrádzajúce D-14.

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
- Výška zľavy za platbu online (%).
- Rozhovor s právnikom (už prebieha pre OQ #1 / #27): storno podmienky,
  **doba uchovávania kontaktov zákazníkov** (reklamácie, NoShow,
  štatistiky → potom anonymizácia), adresa pri dovoze, AI otázky
  návštevníkov (90 dní).
- Hodinové sadzby, paušál a sadzba za km pre dovoz.
