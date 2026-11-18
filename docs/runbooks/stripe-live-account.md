# Prechod na živý Stripe účet Tenanta (D-26, NFR-05; issue #213)

Postup, ako prepnúť produkciu z testovacích Stripe kľúčov na **vlastný živý
účet Tenanta**. Je to manuálna úloha. V repozitári sa nič nemení: kľúče idú
iba do Netlify, nikdy do repa ani do `.env` v gite.

Kto čo robí:

- **Majiteľ** (Tenant) zakladá účet, prechádza overením (KYC) a vyplňuje
  obchodné údaje. Účet je na firmu, peniaze idú na firemný účet a fungujú
  aj bez správcu (D-26, R-07).
- **Správca** (maintainer) má v Stripe rolu *Developer*. Nastaví webhook,
  vloží kľúče do Netlify a overí prvú platbu.

Mimo rozsahu: storno a refundy z iniciatívy zákazníka čakajú na OQ #1. Tu sa
žiadna cesta refundu nestavia ani nezapína.

---

## 0. Čo musí byť hotové vopred

- [ ] Firemné údaje: IČO, výpis z obchodného registra, IBAN firemného účtu,
      doklad konateľa.
- [ ] Produkčná doména (Websupport DNS → Netlify) funguje cez HTTPS.
      Webhook potrebuje jej presnú adresu. Ďalej ju píšeme ako
      `https://<doména>`.
- [ ] `NUXT_PUBLIC_APP_BASE_URL` v Netlify (Production) je presne
      `https://<doména>`, bez lomky na konci. Z nej server skladá návratové
      adresy zo Stripe (`success_url`, `cancel_url`). Ak tam ostane
      `*.netlify.app`, zákazník sa po platbe vráti na inú doménu.

## 1. Majiteľ: založenie účtu a obchodné údaje

1. Na dashboard.stripe.com založte účet **na firmu** (nie na fyzickú osobu)
   a dokončite *Activate payments*: údaje o firme, konateľ, IBAN na
   výplaty.
2. Zapnite dvojfaktorové overenie pre svoje prihlásenie.
3. **Settings → Business → Public details:**
   - verejný názov firmy: `Rent Star`;
   - podporný e-mail a telefón, ktoré zákazník uvidí;
   - web: `https://<doména>`.
4. **Settings → Business → Statement descriptor:** text na výpise
   zákazníka, najviac 22 znakov (napr. `RENT STAR`). Zákazník podľa neho
   platbu spozná. Ak ju nespozná, rastie riziko sporu (chargeback).
5. **Settings → Payments → Payment methods:** pre pilot nechajte zapnuté
   **len Cards, Apple Pay a Google Pay**. Ostatné metódy vypnite, hlavne
   tie s oneskoreným potvrdením (SEPA Direct Debit, bankový prevod a pod.).
   Dôvod je v časti [Známe obmedzenia](#známe-obmedzenia).
6. **Settings → Team:** pozvite správcu s rolou **Developer**, nie
   Administrator.

## 2. Majiteľ alebo správca: vzhľad platobnej stránky (D-59)

**Settings → Branding** (platí pre hosted Checkout aj pre e-maily Stripe):

- Brand color: `#1f5fa8` (`--ht-brand`)
- Accent color: `#2b2f8f` (`--ht-brand-deep`)
- Icon / logo: zatiaľ nič. Vektorové logo ešte nie je dodané (D-59 sadzia
  wordmark písmom). Doplní sa, keď ho Tenant dodá.

Hodnoty sú z `app/assets/css/tokens.css`, z verejného povrchu.

## 3. Správca: webhook

Rezerváciu potvrdzuje **webhook**, nie návrat zákazníka zo Stripe. Bez
webhooku peniaze prídu, ale rezervácia ostane `pending` a po 30 minútach
pustí kapacitu (D-37).

1. V **živom režime** (prepínač *Test mode* vypnutý) otvorte
   **Developers → Webhooks → Add endpoint**.
2. Endpoint URL: `https://<doména>/api/webhooks/stripe`
3. Events: **iba `checkout.session.completed`**. Na nič iné kód nereaguje
   (`server/contexts/payments/gateway.ts`), ostatné udalosti by iba
   pribúdali v logu.
4. API version: `2026-08-26.dahlia`, teda verzia, ktorú používa SDK
   `stripe@22.x` v projekte. Ak ju formulár neponúkne, nechajte predvolenú
   verziu účtu a skontrolujte prvé doručenie v kroku 6.
5. Po uložení skopírujte **Signing secret** (`whsec_…`) a choďte rovno na
   krok 4.

## 4. Správca: kľúče do Netlify

1. **Developers → API keys** (živý režim): vytvorte alebo odhaľte
   **Secret key** (`sk_live_…`). Stripe ho môže ukázať len raz. Vložte ho
   priamo do Netlify, nikam inam si ho neukladajte.
   - Kód potrebuje: vytvoriť a zrušiť (expire) Checkout Session a vytvoriť
     refund. Refund volá automatika D-37, keď platba príde po vypršaní
     rezervácie a kapacita už nie je, a pri druhej platbe za tú istú
     skupinu. Ak použijete *restricted key* (`rk_live_…`), musí mať zápis
     do Checkout Sessions a Refunds. Bez toho D-37 zlyhá. Ak si nie ste
     istí, použite štandardný secret key.
2. Netlify → Site configuration → **Environment variables**. Pri každej
   premennej nastavte hodnotu **iba pre kontext Production**. Deploy
   Previews a branch deploys nechajte na testovacích kľúčoch, aby náhľad
   PR nikdy nestrhol skutočné peniaze:

   | Premenná | Production | Ostatné kontexty |
   |---|---|---|
   | `NUXT_STRIPE_SECRET_KEY` | `sk_live_…` | `sk_test_…` (bez zmeny) |
   | `NUXT_STRIPE_WEBHOOK_SECRET` | `whsec_…` z kroku 3 | testovací `whsec_…` (bez zmeny) |
   | `NUXT_PUBLIC_APP_BASE_URL` | `https://<doména>` | bez zmeny |

3. Prepnite v čase, keď **nikto nie je uprostred platby**. Rezervácia
   začatá s testovacím kľúčom by sa už nepotvrdila: jej webhook príde na
   testovací endpoint a podpis nesedí. Najjednoduchšie je prepnúť mimo
   otváracích hodín.
4. Netlify berie zmenu premenných až pri ďalšom deployi:
   **Deploys → Trigger deploy → Deploy site**.

Kľúče meníte dvaja, vždy spolu (`.env.example`: „rotation is a two-party
event“). Majiteľ vie, kedy sa kľúč zmenil, a správca vie, kde je použitý.

## 5. Kontrola pred prvou platbou

- [ ] Netlify deploy prebehol s novými premennými (čas deployu je po zmene).
- [ ] Stripe → Webhooks → endpoint je *Enabled* a ukazuje živý režim.
- [ ] Payment methods: iba karty, Apple Pay a Google Pay.
- [ ] Na `https://<doména>` sa načíta katalóg a košík ukáže cenu.

## 6. Jedna skutočná platba od začiatku do konca

Platba je **skutočná** (živá karta, skutočné peniaze na firemný účet).

1. Majiteľ ako zákazník urobí rezerváciu jedného lacného kusu na deň, keď
   ho naozaj príde vyzdvihnúť. Najlepšie ju rovno použiť ako jednu z
   rezervácií pri skúške pultu (#135, `counter-run-through.md`). Prečo, je
   vysvetlené v kroku 7.
2. Na hosted Checkout skontrolujte názov Rent Star, farby a sumu v EUR.
   Zaplaťte vlastnou kartou.
3. Overte, že:
   - [ ] prehliadač sa vrátil na `https://<doména>/reservations/<id>/success`;
   - [ ] Stripe → Webhooks → endpoint → posledné doručenie má **HTTP 200**
         a telo `{"outcome":"confirmed"}`;
   - [ ] prišiel potvrdzovací e-mail (Resend) s odkazom na samoobsluhu;
   - [ ] v administrácii na **Pult** je rezervácia v deň vyzdvihnutia medzi
         „Dnešné vyzdvihnutia“ a pri vydaní ukazuje „Zaplatené online
         kartou“;
   - [ ] Stripe → Payments ukazuje platbu *Succeeded* na správnu sumu.
4. Ak webhook vráti **400**: nesedí `NUXT_STRIPE_WEBHOOK_SECRET` (testovací
   secret alebo secret z iného endpointu), alebo deploy po zmene
   neprebehol. Opravte premennú, znovu nasaďte a v Stripe použite
   **Resend** pri danej udalosti. Spracovanie je idempotentné, opakované
   doručenie nič nezdvojí.
5. Ak webhook vráti **5xx**: pozrite Sentry a Netlify function log. Stripe
   bude doručovať znovu sám až 3 dni.

## 7. Refund testovacej platby: rozhodnutie pre majiteľa

Zoznam z 15. 11. obsahuje aj „testovaciu platbu a refund v live režime“.
Systém zatiaľ nemá cestu na storno (OQ #1), preto:

- Refund cez **Stripe dashboard** vráti peniaze, ale aplikácia sa o ňom
  nedozvie. Počúva iba `checkout.session.completed`. Platba ostane v
  databáze `succeeded`, rezervácia `confirmed` a v Štatistikách (S-25) sa
  suma ráta ako tržba.
- Preto odporúčame testovaciu rezerváciu naozaj uskutočniť (vydať a
  vrátiť pri skúške pultu) a **nerefundovať**. Peniaze sú skutočná tržba
  firmy a čísla sedia.
- Ak majiteľ refund chce, urobí ho v dashboarde s vedomím, že v
  Štatistikách ostane o túto sumu viac. Nikto nemení databázu ručne.

Refund automatikou D-37 sa takto neotestuje. Jeho logiku pokrývajú testy
v `tests/server/utils/payment-webhook-flow.test.ts` proti falošnej bráne.
Živý kľúč musí mať na refundy oprávnenie (krok 4).

## 8. Návrat späť (rollback)

Ak živé platby treba zastaviť:

1. Netlify (Production): `NUXT_STRIPE_SECRET_KEY` a
   `NUXT_STRIPE_WEBHOOK_SECRET` vráťte na testovacie hodnoty a spustite
   **Trigger deploy**.
2. Stripe (živý režim) → Webhooks → endpoint → **Disable**.
3. Už zaplatené rezervácie ostávajú platné. Peniaze sú na účte Tenanta a
   nič sa nevracia automaticky.

## Známe obmedzenia

- **Oneskorené platobné metódy.** Kód považuje `checkout.session.completed`
  za zaplatenie a nekontroluje `payment_status`. Pri kartách, Apple Pay a
  Google Pay je to v poriadku, platba je pri tejto udalosti hotová. Pri
  metódach ako SEPA Direct Debit prichádza táto udalosť ešte pred
  pripísaním peňazí (`payment_status: unpaid`). Rezervácia by sa potvrdila
  bez zaplatenia. Preto krok 1.5. Ak ich niekedy treba zapnúť, najprv sa
  musí zmeniť kód (kontrola `payment_status` a udalosti
  `checkout.session.async_payment_succeeded` / `_failed`).
- **Názov položky na platobnej stránke** je anglický a technický:
  `Rental fee — ReservationGroup <id>` (`gateway.ts`). Zákazník ho vidí
  na Checkout a v potvrdení zo Stripe. Je to kandidát na samostatnú
  úpravu (D-20).
- **eKasa:** platba na mieste sa eviduje v eKase (S-10). Či sa eKasa týka aj
  online platby kartou cez Stripe, je otázka pre účtovníka, nie pre
  tento postup.
