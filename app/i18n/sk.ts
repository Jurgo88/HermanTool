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
} as const
