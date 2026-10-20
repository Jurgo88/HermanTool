# Podklad pre právne posúdenie — Rent Star, október 2026

Krátkodobý prenájom náradia spotrebiteľom cez web. Pred spustením potrebujeme
od vás písomné odpovede na otázky nižšie. Pri každej je uvedené, čo odpoveď
zmení v aplikácii, aby bolo jasné, prečo sa pýtame.

Návrh obchodných podmienok je priložený (stránka `/podmienky`, verzia
`2026-10-navrh-1`, dá sa vytlačiť do PDF). Napísal ho prevádzkovateľ, nie
právnik; odkazy na predpisy v tomto dokumente sú naše predpoklady na overenie.

## Ako služba funguje

- **Prenajímateľ:** s. r. o., platiteľ DPH, jedna prevádzka. Zákazníci sú
  spotrebitelia (B2C), pilot s ~200 kusmi náradia.
- **Rezervácia:** zákazník si na webe vyberie náradie a dni, zadá meno,
  e-mail a telefón, odsúhlasí podmienky (zaznamenáme verziu a čas) a zaplatí
  cenu prenájmu kartou cez Stripe. Zmluva vzniká prijatím platby; potvrdenie
  príde e-mailom.
- **Prevzatie:** na prevádzke, v prvý deň prenájmu. Zákazník predloží doklad
  totožnosti a zloží **zálohu v hotovosti** (mimo systému). Stav náradia
  odfotíme pri vydaní aj pri vrátení; strhnúť zo zálohy sa dá len pri
  poškodení, ktoré je na fotkách pri vrátení a nie je pri vydaní.
- **Údaje:** meno, e-mail, telefón; fotografia dokladu totožnosti (nahráva ju
  zákazník cez odkaz z e-mailu alebo sa urobí pri výdaji); fotografie stavu
  náradia. Databáza je v EÚ (Frankfurt); kartové údaje vidí iba Stripe.

## 1. Zrušenie a odstúpenie od zmluvy (OQ #1) — blokuje spustenie

**Otázky**

1. Vzťahuje sa na krátkodobý nájom náradia uzavretý cez web právo
   spotrebiteľa odstúpiť od zmluvy uzavretej na diaľku do 14 dní, alebo
   niektorá výnimka? Pre prenájom áut a služby voľného času s pevným termínom
   výnimka v smernici 2011/83/EÚ (čl. 16 písm. l) existuje; nájom náradia
   v nej výslovne nie je. Predpokladáme úpravu v zákone č. 108/2024 Z. z.
   o ochrane spotrebiteľa — prosím overiť.
2. Ak právo na odstúpenie platí: je naše stupňované storno (čl. 9: viac ako
   48 h vopred 100 %, 24–48 h 50 %, potom 0 %) vôbec použiteľné v rámci
   14-dňovej lehoty? Stačí, ak zákazník pri platbe výslovne požiada o
   začatie plnenia pred uplynutím lehoty, a čo potom platí, keď odstúpi?
3. Ako počítať „hodiny pred začiatkom“ — od polnoci prvého dňa, alebo od
   otvorenia prevádzky?
4. Kde je hranica medzi stornom a nevyzdvihnutím: zákazník, ktorý nepríde,
   má náradie držané celé obdobie a peniaze sa nevracajú (čl. 5). Je to
   v poriadku?

**Čo to znamená pre aplikáciu**

| Odpoveď | Zmena v aplikácii |
|---|---|
| Právo na odstúpenie neplatí | Doplníme čl. 10 („právo nemáte, pretože…“), storno podľa čl. 9 zostáva. |
| Platí, so žiadosťou o skoršie plnenie | Pri platbe pribudne druhé povinné zaškrtávacie pole s vaším znením; jeho súhlas zaznamenáme ako pri podmienkach. Doplníme výpočet sumy pri odstúpení. |
| Platí bez obmedzenia | Storno pravidlá v čl. 9 sa pre prvých 14 dní nepoužijú; prepíšeme čl. 9 a 10. |

Rušenie zatiaľ nie je v aplikácii; vracanie peňazí by sa prvé mesiace robilo
ručne cez Stripe. Spôsob, ako zákazník ruší (e-mail, telefón), prosím
potvrdiť.

## 2. Otázky k textu podmienok

| Článok | Otázka |
|---|---|
| 2 | Vzniká zmluva správne až prijatím platby? Je potrebné posielať plné znenie podmienok v e-maile (trvalý nosič), alebo stačí verzia + odkaz? |
| 4, 8 | Je započítanie škody so zálohou a vyúčtovanie do 14 dní v poriadku? Treba zákazníkovi dať doklad o prevzatí zálohy v hotovosti? |
| 5 | Vek 18+ a povinné predloženie dokladu ako podmienka výdaja — v poriadku? |
| 7 | Denná sadzba za každý začatý deň omeškania; po 3 dňoch bez kontaktu „nevrátené“ a trestné oznámenie. Je to primerané a správne formulované? |
| 8 | Náhrada skutočných nákladov na opravu a časovej hodnoty pri strate, aj nad výšku zálohy. Je potrebné vopred uviesť hodnotu náradia? Platí na uplatnenie nároku za poškodenie lehota jedného roka od vrátenia (Občiansky zákonník, nájom)? |
| 11 | Postup a lehota 30 dní pri reklamácii vady náradia — v poriadku pre nájom? |
| 12 | Je správne uviesť SOI ako subjekt alternatívneho riešenia sporov a zmienka o platforme RSO EÚ už nepatrí (platforma bola zrušená)? |
| celé | Chýba niečo z povinných predzmluvných informácií? Treba vzorový formulár na odstúpenie, aj keď právo neplatí? |

## 3. Doklad totožnosti (OQ #2)

**Rozhodnuté 20. 10. 2026 (D-61):** fotografiu dokladu uchovávame **365 dní**
od vyúčtovania zálohy (ak k prevzatiu nedôjde, od nahratia), na základe
**oprávneného záujmu** (čl. 6 ods. 1 písm. f) GDPR). Aplikácia už podľa toho
fotografie ukladá aj maže. Prosíme o písomné potvrdenie tohto základu
vrátane testu proporcionality a toho, či zákon č. 18/2018 Z. z. dovoľuje
kopírovať doklad bez súhlasu (otázka 1). Ak bude potrebný súhlas, doplníme
ho do aplikácie.

**Otázky**

1. Smieme fotografovať alebo skenovať doklad totožnosti zákazníka, a na
   akom právnom základe (súhlas, oprávnený záujem, zmluva)? Zákon č. 18/2018
   Z. z. obmedzuje kopírovanie úradných dokladov — prosím overiť, či a za
   akých podmienok sa to na nás vzťahuje.
2. Postačí namiesto fotografie zapísať typ a číslo dokladu, prípadne iba
   doklad overiť pohľadom? (Najmenej údajov, najmenšie riziko.)
3. Ak fotografiu smieme uchovávať: ako dlho? Potrebujeme **konkrétny počet
   dní** a **právny základ** písomne. Do úvahy berieme lehoty na sporné
   kartové platby (chargeback, rádovo 120 dní a viac) a lehotu na uplatnenie
   škody na prenajatej veci.
4. Od ktorého okamihu lehota plynie — od vrátenia náradia a vyúčtovania
   zálohy? (Aplikácia vie lehotu posunúť práve na tento okamih.)

**Čo to znamená pre aplikáciu:** doplníme jedno číslo (počet dní) a text
zásad ochrany súkromia. Ak stačí číslo dokladu namiesto fotografie,
nahrávanie fotografie odstránime a zapíše sa len číslo — jednoduchšie a
bezpečnejšie.

Súvisí s tým **OQ #3 — zálohy databázy**: fotografie dokladov sa nezálohujú,
ostatné dáta áno. Prosím potvrdiť, ako dlho môžu záložné kópie existovať;
skutočná doba uchovania údajov je doba uchovávania + doba záloh.

## 4. Údaje zákazníka (OQ #27) — blokuje spustenie

Meno, e-mail a telefón sú dnes uložené **bez lehoty vymazania**.

**Otázky**

1. Ako dlho smieme uchovávať meno, e-mail a telefón zákazníka po skončení
   prenájmu, a na akom základe? Účtovné doklady sa uchovávajú 10 rokov
   (zákon č. 431/2002 Z. z.) — vzťahuje sa to aj na kontaktné údaje, alebo
   len na doklad?
2. Smieme e-mail použiť aj na marketing, alebo len na rezerváciu? (Teraz ho
   nepoužívame na nič iné.)

**Čo to znamená pre aplikáciu:** doplníme lehotu a automatické mazanie
alebo anonymizáciu po jej uplynutí.

## 5. Súvisiace — na tej istej schôdzke

- **OQ #4:** potrebujeme zmluvu o spracúvaní osobných údajov so
  sprostredkovateľmi? Ide o vývojára aplikácie a služby Supabase (databáza,
  EÚ), Cloudflare R2 (fotografie), Netlify (hosting; serverové funkcie môžu
  bežať v USA), Resend (e-maily), Sentry (hlásenie chýb) a Stripe (platby).
- **Zásady ochrany súkromia** (stránka `/sukromie`) sú zatiaľ prázdne.
  Napíšeme ich podľa vašich odpovedí v bodoch 3 a 4.
- **Cookies:** používame len nevyhnutné cookies (prihlásenie personálu,
  rozpracovaná platba), preto nemáme lištu so súhlasom. Prosím potvrdiť.

## Čo potrebujeme od vás na výstupe

1. Odpoveď k odstúpeniu (bod 1) a schválené alebo upravené znenie čl. 9 a 10.
2. Pripomienky k ostatným článkom podmienok.
3. Doklad totožnosti: či fotografovať, počet dní uchovávania a právny základ.
4. Údaje zákazníka: počet dní (alebo rokov) a právny základ.
5. Doba uchovávania záloh databázy a stanovisko k zmluvám so sprostredkovateľmi.

Hodnoty z bodov 3 a 4 zapíšeme do technickej dokumentácie spolu s vaším
odôvodnením, aby bolo vždy jasné, odkiaľ pochádzajú.
