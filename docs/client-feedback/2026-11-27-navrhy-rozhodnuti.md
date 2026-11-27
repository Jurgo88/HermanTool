# Návrhy rozhodnutí — 27. 11. 2026

Stav: **na výber pre klienta**. Nič z tohto zatiaľ nie je rozhodnuté.
Po výbere sa rozhodnutie zapíše ako ADR do Part 4 a dá sa hneď robiť.

Tri nové požiadavky z pripomienok klienta. Pri každej sú možnosti, čo
znamenajú pre aplikáciu a pre ochranu údajov, a naše odporúčanie.

Odhad: **S** = dni · **M** = 1–2 týždne · **L** = 2–4 týždne

---

## Prehľad

| # | Požiadavka | Odporúčame | Náročnosť | Čo ešte treba |
|---|---|---|---|---|
| 1 | Otázka k náradiu (#252) | **A**: e-mailom vám, nič sa neukladá | **S** | Na aký e-mail majú otázky chodiť |
| 2 | Newsletter (#253) | **B**: prihlásenie na webe + posielanie cez Resend | **M** | Kto píše novinky; lehota pre záznam súhlasu (právnik) |
| 3 | SMS (#254) | **B**: len pripomienky vyzdvihnutia a vrátenia | **M** | Rozpočet; výber poskytovateľa a zmluva s ním |

---

## 1. Otázka k náradiu (#252)

**Čo klient chce:** pri každom náradí formulár, cez ktorý sa zákazník
môže opýtať.

**Možnosti**

- **A. E-mail prenajímateľovi (odporúčame).** Zákazník zadá e-mail a
  otázku. Systém ju pošle na váš e-mail, s odkazom na náradie. Odpoveď
  napíšete priamo zo svojej schránky: „Odpovedať“ ide zákazníkovi.
  V aplikácii sa otázka **neukladá**, takže netreba riešiť dobu
  uchovávania.
- **B. A + zoznam otázok v administrácii.** Otázky vidíte aj v admine a
  viete si ich odškrtnúť. Otázky sa však ukladajú, takže treba lehotu ich
  mazania (ďalšia otázka pre právnika) a ďalšiu obrazovku.

**Pri oboch:**
- Ochrana proti spamu bez captchy: obmedzenie počtu otázok a skryté pole
  pre roboty. Captcha (napríklad Google) by pridala cookies, a tým aj lištu
  so súhlasom (D-42).
- Krátka veta do Ochrany súkromia.
- Rozhodnúť: na aký e-mail majú otázky chodiť?

**Nie je to** AI odporúčanie na úvodnej stránke (D-64). To odpovedá
automaticky, tento formulár ide človeku.

---

## 2. Newsletter (#253)

**Čo už je:** pri rezervácii môže zákazník zaškrtnúť súhlas s ponukami
e-mailom (#216). Zaznamenáme čas a znenie súhlasu a dá sa odvolať odkazom
v e-maile. **Posielanie samotných e-mailov zatiaľ nie je.**

**Možnosti**

- **A. Len súhlas pri rezervácii + posielanie mimo aplikácie.** Z adminu
  si stiahnete zoznam e-mailov so súhlasom a novinky pošlete cez Resend
  (služba, ktorú už používame na e-maily). **S.** Nevýhoda: zoznam
  treba ručne prenášať a odhlásenie v Resende sa nepremietne späť k nám.
- **B. A + prihlásenie na webe + automatické prepojenie s Resendom
  (odporúčame).** V pätičke webu je políčko „Novinky e-mailom“. Prihlásenie
  treba potvrdiť kliknutím v e-maile (dvojité potvrdenie, dôkaz súhlasu).
  Zoznam sa sám udržiava v Resende. Odhlásenie tam aj u nás je jedno a to
  isté. Novinky píšete a posielate v Resende. **M.**
- **C. Písanie a posielanie noviniek priamo z našej administrácie.** **L.**
  Neodporúčame: Resend to už vie a pre jednu prevádzku sa to neoplatí.

**Treba rozhodnúť:** kto bude novinky písať a ako často. Ako dlho
uchovávať záznam o súhlase, rozhodne právnik (OQ #27).

---

## 3. SMS upozornenia (#254)

**Čo je dnes:** všetky správy chodia e-mailom. Je to potvrdenie, deň
vopred pripomienka vyzdvihnutia (D-68), v posledný deň pripomienka
vrátenia a jedna pripomienka pri omeškaní (D-17). Architektúra s SMS
počítala ako s otázkou nákladov (A-08).

**Možnosti**

- **A. Ostať pri e-maile.** Nič sa nemení, nič to nestojí.
- **B. SMS pre pripomienky vyzdvihnutia a vrátenia (odporúčame).** Toto
  sú správy, pri ktorých záleží na tom, aby si ich zákazník všimol včas.
  E-mail ostáva, SMS ide navyše. **M.**
- **C. SMS pre všetky správy.** Potvrdenie má odkaz na rezerváciu a
  podmienky, to sa do SMS nehodí. Neodporúčame.

**Náklady pri B:** 2 SMS × počet rezervácií za mesiac × cena jednej SMS.
Orientačne niekoľko centov za SMS, presnú cenu dá poskytovateľ. Pri
100 rezerváciách mesačne ide o jednotky až nižšie desiatky eur mesačne.

**Treba rozhodnúť:**
- Áno alebo nie, a s akým mesačným stropom.
- Poskytovateľ SMS: je to nový sprostredkovateľ osobných údajov
  (telefónne číslo), takže treba zmluvu (OQ #4).
- Odosielateľ: „RentStar“ namiesto čísla, ak to poskytovateľ v SR
  umožňuje.

Telefónne číslo už pri rezervácii zbierame. Systém dnes zaručuje, že
každá pripomienka odíde najviac raz (FR-32). Rovnaké pravidlo bude platiť
pre SMS.
