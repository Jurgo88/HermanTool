// UI string catalogue (D-20): every user-facing string goes through
// this lookup, never a literal in a component. Single-valued Slovak
// for the pilot — no locale switching, no per-locale routing. "The
// trigger: the first Tenant or market requiring a second locale"
// (D-20) is not this repo's problem yet; when it is, this file gets a
// sibling instead of a rewrite.
export const sk = {
  common: {
    somethingWentWrong: 'Niečo sa pokazilo.',
  },
  login: {
    title: 'Prihlásenie operátora',
    email: 'Email',
    password: 'Heslo',
    submit: 'Prihlásiť sa',
    invalidCredentials: 'Nesprávny email alebo heslo.',
  },
  publicCatalog: {
    title: 'HermanTool',
    dayRateSuffix: '/ deň, depozit',
    empty: 'Zatiaľ nie je publikované žiadne náradie.',
  },
  adminCatalog: {
    title: 'Správa katalógu',
    assetTypesHeading: 'Typy náradia',
    columnName: 'Názov',
    columnDayRate: 'Cena/deň',
    columnDeposit: 'Depozit',
    columnPublished: 'Publikované',
    published: 'Publikované',
    unpublished: 'Nepublikované',
    publishAction: 'Publikovať',
    unpublishAction: 'Zrušiť publikáciu',
    newHeading: 'Nový typ náradia',
    fieldName: 'Názov',
    fieldDescription: 'Popis',
    fieldDayRate: 'Cena/deň (EUR)',
    fieldDeposit: 'Depozit (EUR)',
    createAction: 'Vytvoriť',
  },
  adminAssetRegistry: {
    title: 'Hromadná registrácia a QR štítky',
    intro:
      'Pre každý kus sa vytvorí Asset a vygeneruje sa nový QR štítok. Vyberte typ náradia a počet kusov nižšie.',
    builderHeading: 'Pridať typy náradia',
    noAssetTypes: 'Zatiaľ nie je vytvorený žiadny typ náradia — vytvorte ho najprv v Správe katalógu.',
    assetTypeLabel: 'Typ náradia',
    quantityLabel: 'Počet kusov',
    addLineAction: 'Pridať',
    removeLineAction: 'Odstrániť',
    columnAssetType: 'Typ náradia',
    columnQuantity: 'Počet kusov',
    invalidLineError: 'Vyberte typ náradia a zadajte kladný počet kusov.',
    advancedToggle: 'Pokročilé: vložiť CSV priamo',
    csvFileLabel: 'Súbor CSV',
    csvTextareaLabel: 'Vložiť CSV (stĺpce "assetTypeId,quantity")',
    submitAction: 'Zaregistrovať a vygenerovať štítky',
    submitting: 'Registrujem…',
    resultHeading: 'Vygenerované štítky',
    resultCount: 'Vygenerovaných {count} štítkov.',
    printAction: 'Tlačiť hárok',
    emptyCsvError: 'Pridajte aspoň jeden riadok, alebo vložte CSV, pred odoslaním.',
  },
  adminJobRuns: {
    title: 'Stav naplánovaných úloh',
    columnJob: 'Úloha',
    columnLastRun: 'Posledný beh',
    columnLastSuccess: 'Posledný úspešný beh',
    outcomeSuccess: 'úspech',
    outcomeFailure: 'zlyhanie',
    neverRun: 'Ešte nebežala',
    jobNames: {
      expiry_sweep: 'Kontrola vypršaných rezervácií',
      evidence_erasure: 'Výmaz identifikačných dokladov',
      pickup_reminder_dispatch: 'Pripomienky na vyzdvihnutie',
      return_reminder_dispatch: 'Pripomienky na vrátenie',
      overdue_reminder_dispatch: 'Pripomienky pri omeškaní',
      database_backup: 'Záloha databázy',
      unconfirmed_identity_evidence_sweep: 'Kontrola nepotvrdených identifikačných dokladov',
      unconfirmed_condition_report_sweep: 'Kontrola nepotvrdených fotodokumentácií',
    },
  },
} as const
