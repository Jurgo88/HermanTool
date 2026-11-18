# Nočný beh 18.–19. 11. 2026 — ranný report

Úlohy podľa zadania: ADR + #210, #211, #215, #216, #217. Bez zásahu do #212, #213, #214, #218.
Nič nebolo mergnuté, nič nešlo do `main`, žiadny force push, žiadna migrácia ani zápis
na vzdialenú databázu, `.env` ani nastavenia Netlify/Supabase/Stripe som nemenil.

## Prehľad

| # | Úloha | Vetva | PR | Stav |
|---|---|---|---|---|
| 0 | ADR D-62…D-67 (Part 4 §16.6) + CLAUDE.md | `docs/adr-client-feedback` | [#220](https://github.com/Jurgo88/HermanTool/pull/220) | hotové |
| 1 | #210 CompatibleAssetType | `feat/compatible-asset-type` | [#221](https://github.com/Jurgo88/HermanTool/pull/221) | hotové |
| 2 | #211 Štatistiky v admine (S-25) | `feat/admin-statistics` | [#222](https://github.com/Jurgo88/HermanTool/pull/222) | hotové |
| 3 | #215 Platba na mieste + zľava za online | `feat/on-site-payment` | [#223](https://github.com/Jurgo88/HermanTool/pull/223) | hotové (blokované časti vynechané) |
| 4 | #216 Marketingový súhlas | `feat/marketing-consent` | [#224](https://github.com/Jurgo88/HermanTool/pull/224) | hotové |
| 5 | #217 Dovoz a odvoz | `feat/delivery-collection` | [#225](https://github.com/Jurgo88/HermanTool/pull/225) | hotové |

Žiadny PR nie je draft.

## Poradie mergovania

Vetvy sú reťaz, každý PR má base `main` a obsahuje commity predchádzajúcich:

1. #220 → 2. #221 → 3. #222 → 4. #223 → 5. #224 → 6. #225

Po mergnutí #220 sa diff #221 zmenší na jeho vlastné commity (a tak ďalej). Migrácie majú
časové značky `20261119090000` … `20261119120000` v rovnakom poradí.

## Čo z jednotlivých issues NIE JE hotové a prečo

**ADR (#220)**
- PR nemá „Closes #N“ — pre ADR nie je samostatné issue. Cituje `Refs #210 #211 #214 #215 #217 #218`;
  issues sa zatvoria implementačnými PR (#214 a #218 ostávajú otvorené).
- #216 som zámerne nezapísal ako ADR (žiadny nový pojem, vzor D-35) — je to uvedené v §16.6.

**#210 CompatibleAssetType** — všetko zo scope. Navyše: Accessory nemôže byť kompatibilné
(ani z jednej strany) a zmena na Accessory vyžaduje zrušiť väzby (editor to urobí v tom istom uložení).

**#211 Štatistiky**
- Riadok tržieb z platby na mieste som doplnil až v #215 (ako ste chceli); v #211 je len miesto v kóde.
- Návratnosť kusu (ROI) a história zákazníka — mimo scope (ROI) / čaká na OQ #27.

**#215 Platba na mieste**
- **Nerobil som** (blokované v issue): zákaz platby na mieste po NoShow (OQ #27 / IR-07), storno/refund (OQ #1), SMS.
- **Rozhodnutie 7 — nespravené, potrebujem vaše rozhodnutie:**
  - *„Pripomienka deň vopred“*: existujúca pripomienka vyzdvihnutia sa posiela v deň začiatku
    (časovanie je OQ #7) a pokrýva aj skupiny s platbou na mieste. Presun na „deň vopred“ by menil
    hodnotu OQ #7 pre všetkých — nemenil som.
  - *„NoShow uvoľní zvyšok obdobia“*: je v rozpore s D-17 (žiadny automatický timeout) a dotýka sa
    W11/OQ #1. Bez výslovného rozhodnutia (ideálne ADR) som to nestaval.
- Výška zľavy: **nevymyslená**. Nastavenie je prázdne = žiadna zľava; Stripe účtuje rovnakú sumu ako doteraz,
  kým majiteľ nevyplní % na S-27 (OQ #31 doplnený do Part 4).
- Riadok tržieb na mieste v štatistikách: **hotový** (malá zmena) — vlastná dlaždica, nikdy nesčítaný s online tržbami (P6).

**#216 Marketingový súhlas**
- Otvorené u právnika (s OQ #27): doba uchovávania záznamov o súhlase a e-mailu; či smieme
  existujúcich zákazníkov osloviť na opt-out báze. Nič nevymyslené — žiadny RetentionDeadline.
- Žiadny marketingový e-mail sa neposiela (podľa issue). `issueMarketingUnsubscribeToken` je pripravené pre budúceho odosielateľa.

**#217 Dovoz a odvoz**
- Paušál, sadzba za km a obce v zóne: **nevymyslené** (OQ #32). Kým nie je paušál a aspoň jedna obec,
  dovoz sa v checkoute vôbec neponúkne.
- Oprava atestácie poplatku vodičovi (supersede) nie je postavená — jedna atestácia na úsek.
- Test „HandoverOut/HandoverIn pri dovoze stále vyžaduje doklad, fotky, sken“: kód odovzdania sa nemení
  (nový kontext sa ho nedotýka), takže som pridal len poznámku v PR, nie samostatný test.

## Výsledky kontrol

`pnpm` nie je v PATH (ani `corepack` v Node 26), preto som skripty z `package.json` spúšťal
priamo cez `node_modules/.bin` — rovnaké príkazy (`eslint .`, `nuxt typecheck`, `vitest run`,
`node scripts/check-*.mjs`).

| Kontrola | Výsledok (posledná vetva `feat/delivery-collection`) |
|---|---|
| lint | ✅ 0 chýb |
| typecheck | ✅ 0 chýb (na `main` padal — pozri nižšie) |
| test (DB vypnutá) | ✅ **569 prešlo, 90 preskočených**, 0 zlyhaní (79 + 20 súborov) |
| test proti lokálnej DB | ✅ **608 / 608** (unit + integračné, 86 súborov) |
| check:banned-terms | ✅ |
| check:no-draft-copy | ❌ — **padá už na `main` zámerne** (D-52): `checkout.vue`, `podmienky.vue`, `sukromie.vue`. Nepribudol žiadny nový súbor; nové právne texty (súkromie: súhlas, adresa) som dal do `sk.draft.*`. |

Počty po vetvách (DB vypnutá): main 489/87 → #221 514/90 → #222 529/90 → #223 552/90 → #224 559/90 → #225 569/90.

**Prečo 90 preskočených:** integračné testy sa samy preskočia bez `NUXT_DATABASE_URL`. V `.env` ukazuje
na Supabase pooler (vzdialená DB), takže som ich pre bežné behy vypol prázdnou premennou v procese.
Bežiaci lokálny Supabase na porte 54322 patrí inému projektu (`another-hockey-manager`) — testy robia
`TRUNCATE`, takže som ho nepoužil.

**Overenie na lokálnej DB:** na konci som spustil dočasný kontajner z už stiahnutého obrazu
`supabase/postgres:17.11.0.018` (127.0.0.1:55432), aplikoval **všetkých 28 migrácií** (aj nové štyri
druhýkrát — sú idempotentné), doplnil minimálny seed (tenant, `auth.users` + 2 operátori — rovnaký
predpoklad, aký majú existujúce integračné testy voči rehearsal DB) a spustil celú unit+integračnú sadu
s `NUXT_DATABASE_URL` na localhost: 608/608 vrátane OQ #23 testu súbežnosti D-08. Kontajner som potom zmazal.

## Rozhodnutia, ktoré som urobil sám

1. **Typecheck na `main` padal** (TS2321 „excessive stack depth“ v `ClassificationListEditor.vue`, inferencia
   typu routy v `$fetch`). Opravené explicitnými generikami `$fetch<unknown, string>` (samostatný commit v #221).
   Rovnaký problém sa objavil v `admin/delivery.vue` — s rastom počtu rout sa to môže opakovať; náprava je rovnaká.
2. **Nové obrazovky**: S-25 Štatistiky, S-26 potvrdenie rezervácie s platbou na mieste, S-27 Nastavenia,
   S-28 odhlásenie z ponúk, S-29 Dovoz a odvoz — doplnené do `interface-design-foundation.md`. Logo v admin lište vedie na S-25.
3. **Nové OQ v Part 4:** #31 výška zľavy, #32 poplatky za dovoz a zóna, #33 hodinové sadzby a otváracie hodiny.
4. **Nové kontexty** v ESLint mape: `utilisation-reporting` (len čítanie, smie A&R) a `logistics-delivery` (bez importov).
5. **Tenant settings** = nová tabuľka `tenant_settings` (jeden riadok na Tenanta, NULL = nenastavené); Tenant & Access je stále `[Future]`.
6. **Štatistiky:** dátum tržby = deň, keď platba prešla na `succeeded` (`payments.updated_at`, iný stĺpec neexistuje);
   tržba po typoch = platba skupiny rozdelená podľa *aktuálnej* dennej sadzby × dni (cena riadku sa neukladá);
   menovateľ vyťaženosti = *dnešný* D-38 pool × dni (pool nie je verzovaný); „rezervácie tento mesiac“ = potvrdené,
   ktoré tento mesiac začínajú; zálohy v šuplíku = `deposit_taken` bez `deposit_returned` (vrátane stratených kusov).
7. **Platba na mieste:** „aktívna“ skupina pre limit = ešte drží kapacitu a platba ešte nie je atestovaná;
   potvrdzovací odkaz platí 24 h (ak medzitým vypršali 30-min. pending holdy, klik ich znovu získa cez D-37, ak je voľno);
   potvrdenie je tlačidlo (POST), nie otvorenie odkazu — ochrana pred prefetchom mailových skenerov;
   na pulte sa suma berie zo servera (bez zľavy) a guard v HandoverOut je fail-closed;
   pri skupine s platbou na mieste server odmietne online nahratie dokladu (D-15 (c)), stránka s odkazom to vysvetlí.
8. **Súhlas:** kontakt = normalizovaný e-mail; nezaškrtnuté políčko pri ďalšej rezervácii nič nezapisuje (nie je to odvolanie);
   verzia textu je v `shared/marketing-consent.ts`, ktorú číta prehliadač aj server — iná verzia sa odmietne.
9. **Dovoz:** pri skupine s rôznymi obdobiami (D-13) dovoz v najskorší prvý deň, odvoz v najneskorší posledný deň;
   km celé číslo 0–1000; poplatky v zóne sa platia spolu s nájomným a zľava sa na ne nevzťahuje.
10. **Najbližšie spoločné termíny (#210):** hľadanie ±60 dní, max 3 návrhy — prezentačné hranice, nie politika.

## Otázky na vás

1. **#215 rozhodnutie 7:** chcete pripomienku deň vopred (zmena OQ #7 pre všetkých) a uvoľnenie po NoShow (zmena D-17)? Ak áno, napíšem k tomu ADR.
2. Výška zľavy (OQ #31), paušál / sadzba za km / obce v zóne (OQ #32) — vyplní majiteľ v admine, alebo ich mám nastaviť migráciou, keď ich dodáte?
3. Má mať oprava atestácie poplatku vodičovi (dovoz mimo zóny) rovnaký „supersede“ mechanizmus ako platba na mieste?
4. Štatistiky: vyhovuje rozdelenie tržby skupiny podľa aktuálnych sadzieb, alebo chcete ukladať cenu riadku pri checkoute (nový stĺpec, presnejšie do budúcna)?
5. Mimochodom: v pracovnej kópii boli necommitnuté zmeny, ktoré nie sú moje — `.nuxtrc` (verzia `@nuxt/test-utils` 4.1.0 → 4.4.0) a netrackovaný `package-lock.json`. Nechal som ich tak a nikam som ich nepridal.
