# Skúška pultu so zamestnancom na reálnom telefóne (WP-6.4; issue #135)

Overovacia úloha, nie vývoj. Majiteľ a zamestnanec prejdú celý tok
W3 → W5 na **skutočnom telefóne pri pulte**, so skutočnými kusmi a
štítkami. Cieľ je zistiť, čo bolo pomalé, mätúce alebo čo bolo treba
skúsiť dvakrát. Zistenia z časti [Záznam](#záznam) sa prepíšu do issue
#135 a správca z nich spraví opravy.

Zamestnanec ovláda telefón sám. Majiteľ hrá zákazníka a zapisuje.
Nenapovedajte mu. Miesto, kde treba napovedať, je zistenie.

Čas: približne 1,5 hodiny.

---

## 0. Príprava (deň vopred, majiteľ)

- [ ] **Telefón pri pulte:** nabitý, prehliadač aktuálny, aplikácia
      pridaná na plochu (PWA). Zapíšte značku, model, systém a prehliadač.
      Tieto údaje sa majú dostať do UI-OQ-1.
- [ ] **Prihlásenie:** na telefóne je prihlásený jeden operátor
      (zdieľaný telefón, F8). Kto vykonal ktorý úkon, rozlišuje PIN, nie
      prihlásenie.
- [ ] **PIN:** majiteľ aj zamestnanec si v **Môj PIN** nastavia **každý
      iný** PIN. Ak sú rovnaké, systém úkon pripíše tomu, koho nájde
      prvého, a záznam o tom, kto čo urobil, bude nesprávny.
- [ ] **Kusy:** aspoň 3 kusy s nalepeným štítkom v stave *dostupné*.
      Jeden z nich musí byť **dvakrát po sebe** (scenár E).
- [ ] **Rezervácie na deň skúšky** (zákazník = majiteľ, jeho e-mail a
      telefón):
  - **R1 – zaplatená online.** Ak je už živý Stripe, použite
    testovaciu platbu z `stripe-live-account.md` §6. Doklad totožnosti
    nahrajte online cez odkaz z potvrdzovacieho e-mailu.
  - **R2 – platba na mieste.** Rezerváciu potvrďte tlačidlom v e-maile.
    Doklad sa pri tejto forme nahrať online nedá, odfotí sa na pulte.
  - **R3 – s dovozom** (scenár F). Dá sa vytvoriť len vtedy, keď sú
    v **Dovoz** vyplnené ceny a aspoň jedna obec. Kým sú ceny otvorené
    (OQ #32), scenár F vynechajte. Do produkcie kvôli skúške
    nevypĺňajte vymyslené ceny.
- [ ] **Pripomienka:** deň pred skúškou príde na e-mail z R1 a R2
      pripomienka vyzdvihnutia (D-68). Zapíšte, či prišla a kedy.
- [ ] **Podmienky na mieste:** skúste aj na slnku pri dverách, nielen
      vnútri. Kontrast pri dennom svetle je otvorená časť UI-OQ-1.

---

## A. Vydanie, zaplatené online (R1)

| # | Krok | Očakávané | OK? |
|---|---|---|---|
| A1 | **Pult** → „Dnešné vyzdvihnutia“ | R1 je v zozname, meno a typ náradia sedia | |
| A2 | „Vydať“ pri R1 | Obrazovka „Vydanie náradia — meno“ | |
| A3 | Nájomné | „Zaplatené online kartou.“, nič sa nevyberá | |
| A4 | Overenie totožnosti → „Zobraziť fotografiu“ | Pýta PIN. Po PIN-e sa doklad zobrazí | |
| A5 | Porovnať doklad so zákazníkom → „Zhoduje sa — overiť“ | „Overenie totožnosti zaznamenané.“ | |
| A6 | Záloha | Suma v hotovosti je jasne viditeľná | |
| A7 | Naskenovať štítok **kamerou** | Kód sa vyplní bez písania | |
| A8 | Odfotiť stav (2–3 fotky) | Každá fotka prejde: Čaká → Nahráva sa → Nahrané → **Potvrdené** | |
| A9 | „Potvrdiť vydanie“ → PIN **zamestnanca** | „Náradie vydané. Zmluva #…“ | |
| A10 | Kartu kusu otvoriť skenom | Stav „u zákazníka“, v histórii je vydanie s menom **zamestnanca** | |

## B. Vydanie s platbou na mieste (R2)

| # | Krok | Očakávané | OK? |
|---|---|---|---|
| B1 | „Vydať“ pri R2 | Nájomné: „Prijmite na mieste …“ (bez zľavy za online) | |
| B2 | Skúsiť „Potvrdiť vydanie“ bez platby | Nedá sa: „Bez potvrdenej platby sa náradie vydať nedá.“ | |
| B3 | Zaevidovať v eKase, zvoliť formu (hotovosť / terminál / QR) → „Potvrdiť prijatie platby“ → PIN | „Prijaté … (forma), čas.“ | |
| B4 | „Odfotiť doklad na pulte“ → Nahrať → overiť | Fotka dokladu sa nahrá a overenie sa zapíše | |
| B5 | Záloha, sken, fotky, „Potvrdiť vydanie“ → PIN | Vydané. V histórii je platba aj vydanie s menom toho, kto zadal PIN | |

## C. Vrátenie a vyrovnanie zálohy (R1, bez poškodenia)

| # | Krok | Očakávané | OK? |
|---|---|---|---|
| C1 | Naskenovať štítok vráteného kusu | Systém sám ponúkne **vrátenie** (nič sa nevyberá) | |
| C2 | Odfotiť stav pri vrátení | Fotky prejdú až na **Potvrdené** | |
| C3 | „Potvrdiť vrátenie“ → PIN | „Náradie vrátené. Pokračujte vyrovnaním zálohy.“ | |
| C4 | Vyrovnanie zálohy | Fotodokumentácia pri vydaní aj vrátení je „potvrdená“ | |
| C5 | Vrátiť celú sumu → „Potvrdiť vyrovnanie“ → PIN | „Záloha vyrovnaná.“ | |

## D. Vrátenie so zrážkou (R2)

| # | Krok | Očakávané | OK? |
|---|---|---|---|
| D1 | Vrátenie ako C1–C3 | Ako vyššie | |
| D2 | Zadať nižšiu sumu bez dôvodu | Systém nepustí ďalej, pýta dôvod zrážky | |
| D3 | Doplniť dôvod → potvrdiť → PIN | Zrážka sa zapíše, v histórii je dôvod | |

Pri D si všimnite, či je zrejmé, že zrážka sa dá zapísať **len s fotkami
z oboch strán** (FR-20). Ak by niektorá fotka ostala nepotvrdená, systém
zrážku odmietne a ukáže prečo.

## E. Ten istý kus druhýkrát

| # | Krok | Očakávané | OK? |
|---|---|---|---|
| E1 | Kus vrátený v C skúste vydať na ďalšiu rezerváciu (napr. zajtrajšiu) | Kus sa dá znova vydať | |

> **Známa medzera, ktorú má tento krok odhaliť:** po vrátení je kus
> v stave *na kontrole*. Server má na jeho vrátenie medzi dostupné
> operáciu (D-09: najskôr deň po poslednom dni prenájmu), ale žiadna
> obrazovka ju zatiaľ nevolá. Sken takého kusu ukáže iba kartu kusu.
> Ak sa to potvrdí, zapíšte to ako zistenie. Oprava je samostatné issue.

## F. Dovoz k zákazníkovi (R3, iba ak sú vyplnené ceny dovozu)

| # | Krok | Očakávané | OK? |
|---|---|---|---|
| F1 | **Dovoz** → „Najbližšie dovozy a odvozy“ | R3 je v zozname s oknom (dopoludnia / popoludní) a adresou | |
| F2 | Mimo zóny: zadať km → „Vypočítať cenu“ | Suma sa vypočíta zo sadzby | |
| F3 | „Potvrdiť prijatie …“ → PIN | „Platba za dopravu je potvrdená.“ | |
| F4 | Vydanie u zákazníka (vonku, mobilné dáta) | Rovnaký tok ako A: doklad, fotky, sken, záloha | |
| F5 | Odvoz: vrátenie u zákazníka | Rovnaký tok ako C | |

## G. Situácie, ktoré sa stanú

| # | Situácia | Očakávané | OK? |
|---|---|---|---|
| G1 | Zakázať prehliadaču kameru → skenovať | „Prístup ku kamere nie je možný…“, kód sa dá zadať ručne | |
| G2 | Zadať nesprávny PIN | Odmietnutie bez prezradenia, či PIN „takmer“ sedel | |
| G3 | Počas nahrávania fotky vypnúť dáta, potom zapnúť | Fotka ukáže „Chyba“, „Skúsiť znova“ ju nahrá | |
| G4 | Uprostred vydania stlačiť „späť“ | Pýta sa: „Rozrobené vydanie náradia sa stratí…“ | |
| G5 | Dodatočný záznam: vydanie, ktoré sa naozaj stalo pred hodinou | Treba zadať čas a dôvod, záznam má oba časy | |
| G6 | „Ďalšie zoznamy“ → Omeškané / Nedostavili sa | Zoznamy sa otvoria. Ide o odvodené údaje, nie o stav kusu (FR-28) | |
| G7 | Zavolať zákazníkovi z obrazovky | Telefón ponúkne hovor | |

**„Nahlásiť ako stratené“ neskúšajte na skutočnom kuse.** Úkon je
nezvratný a kus vyradí z prevádzky. Stačí overiť, že pýta potvrdenie,
dôvod a PIN, a potom ho zrušiť.

---

## Záznam

Pre každý problém jeden riadok. Neopravujte ho na mieste, iba ho zapíšte.

| Krok | Čo sa stalo | Pomalé / mätúce / chyba / dvakrát | Ako dlho (odhad) |
|---|---|---|---|
| | | | |

Na konci zapíšte:

- Celkový čas jedného vydania (A2 → A9) a jedného vrátenia (C1 → C5).
- Či zamestnanec **niekedy písal kód štítku ručne** a prečo. To je
  otázka, ktorú WP-2 mal vyriešiť.
- Čo by zamestnanec zmenil ako prvé.
- Zariadenie (model, systém, prehliadač) a ako sa dal displej čítať na
  slnku.

Výsledok vložte ako komentár do #135. Každá chyba, ktorá potrebuje
opravu, dostane vlastné issue.
