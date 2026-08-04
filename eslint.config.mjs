// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'
import eslintConfigPrettier from 'eslint-config-prettier'
import importX from 'eslint-plugin-import-x'

// D-34 (Part 4 §16, IR-03): banned terms and dependency direction are
// linted in CI and the build fails on violation. This file is the
// enforcement; CLAUDE.md's banned-terms list and Part 1 §4's context map
// are the source of truth it encodes.

// CLAUDE.md's banned-terms list, in identifier form. "Check-out/Check-in"
// (hyphenated, not a valid identifier on its own) becomes its camelCase
// forms. `Session` is banned only as a domain term standing in for
// ReservationGroup — id-denylist matches whole identifiers, so it does
// NOT flag compounds like `OperatorSession` or `checkout-session.ts`,
// and does not flag third-party members like `.auth.getUser()`.
const BANNED_IDENTIFIERS = [
  'Booking',
  'Order',
  'Item',
  'Product',
  'Inventory',
  'User',
  'CheckOut',
  'CheckIn',
  'checkOut',
  'checkIn',
  'Role',
  'Permission',
  'Account',
  'Cart',
  'Session',
  'Fulfilled',
  'Escalation',
  'Case',
  'Ticket',
  'name_sk',
  'rentalGranularity',
]

// Part 1 §4 context map: which bounded context may import which other
// bounded context's published interface. Arrows point upstream -> the
// downstream context depends on the upstream one's language; there are
// no cycles. `_shared` (TenantId etc.) is cross-cutting, not a context,
// and is deliberately not part of this map.
const CONTEXT_ALLOWED_IMPORTS = {
  catalog: [],
  'asset-registry': [],
  payments: [],
  'customer-identity-compliance': [],
  'availability-reservation': ['catalog', 'asset-registry', 'payments'],
  'handover-possession': ['availability-reservation', 'asset-registry', 'customer-identity-compliance'],
  notification: ['handover-possession', 'availability-reservation'],
}

const CONTEXT_NAMES = Object.keys(CONTEXT_ALLOWED_IMPORTS)

// Every location capable of importing a context: the six other
// contexts, plus the composition layer (server/utils, server/api) --
// D-02's "no context reaches into another's internals" binds everyone,
// not just other contexts. server/utils/payment-webhook-flow.ts and the
// checkout route are the two places that legitimately compose two
// contexts' PUBLISHED interfaces (see docs/reviews/
// implementation-review-2026-08-04.md); nothing here needs to exempt
// them specifically, because importing a published interface (a
// context's index.ts) was never restricted -- only reaching into a
// context's internals is.
const ALL_LOCATIONS = ['./server/utils', './server/api', ...CONTEXT_NAMES.map((name) => `./server/contexts/${name}`)]

const noRestrictedPathsZones = []

for (const contextName of CONTEXT_NAMES) {
  // Internals boundary: nothing outside this context -- no other
  // context, no server/utils, no server/api -- may import anything
  // from it except its published interface (index.ts).
  noRestrictedPathsZones.push({
    target: ALL_LOCATIONS.filter((loc) => loc !== `./server/contexts/${contextName}`),
    from: `./server/contexts/${contextName}`,
    except: ['index.ts'],
    message: `Contexts publish an interface via index.ts (D-02). Import from './server/contexts/${contextName}', not its internals.`,
  })

  // Dependency direction: this context may only import the upstream
  // contexts the map allows, even via their published interface.
  const allowed = new Set(CONTEXT_ALLOWED_IMPORTS[contextName])
  const forbidden = CONTEXT_NAMES.filter((other) => other !== contextName && !allowed.has(other))
  for (const forbiddenContext of forbidden) {
    noRestrictedPathsZones.push({
      target: `./server/contexts/${contextName}`,
      from: `./server/contexts/${forbiddenContext}`,
      message: `Part 1 §4's context map does not allow '${contextName}' to depend on '${forbiddenContext}' (D-02, D-34).`,
    })
  }
}

export default withNuxt(
  eslintConfigPrettier,
  {
    files: ['**/*.{js,ts,vue}'],
    rules: {
      'id-denylist': ['error', ...BANNED_IDENTIFIERS],
    },
  },
  {
    files: ['server/**/*.ts'],
    plugins: { 'import-x': importX },
    settings: {
      'import-x/resolver': {
        typescript: true,
      },
    },
    rules: {
      'import-x/no-restricted-paths': ['error', { zones: noRestrictedPathsZones }],
    },
  },
  {
    // D-12 (IR-03): RentalPeriod owns its own day-arithmetic; nothing
    // else subtracts or enumerates its days directly. This flags the
    // specific "difference of two getTime() reads" pattern (day-count
    // math) rather than any use of Date -- most of server/ legitimately
    // constructs Date values for timestamps, expiry and retention
    // deadlines, which has nothing to do with RentalPeriod arithmetic
    // and would false-positive on ~16 unrelated files if banned
    // outright.
    files: ['server/**/*.ts'],
    ignores: [
      'server/contexts/availability-reservation/rental-period.ts',
      // Already-reviewed exception (Part 5 Finding 12, IR-01's own
      // notes): this is a different day-walk (FR-29 shortfall scanning
      // from today's Rentable count), not RentalPeriod's arithmetic.
      'server/utils/overdue-noshow-views.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "BinaryExpression[operator='-'][left.callee.property.name='getTime'][right.callee.property.name='getTime']",
          message:
            'Day-difference arithmetic belongs in availability-reservation/rental-period.ts (D-12). Reuse or extend its helpers instead of recomputing a day count here.',
        },
      ],
    },
  },
)
