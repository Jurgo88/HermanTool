#!/usr/bin/env node
// D-34/D-44 (docs/design/interface-design-foundation.md §3 UI-D-02):
// id-denylist (eslint.config.mjs) already flags every banned identifier
// across the whole repo, including app/**/*.vue's <script> blocks -- but
// it matches an identifier EXACTLY against the denylist, so it catches a
// variable literally named `cart`, never a compound one like `cartTotal`
// or `CartSummary`. It also cannot see a plain string at all: a CSS
// class name in a template's class="..." attribute, a quoted object
// key, or a component filename are not JS identifier AST nodes. This
// script closes both gaps, for app/** only -- server/**'s domain
// vocabulary is fully covered by id-denylist's own scope already.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Mirrors eslint.config.mjs's BANNED_IDENTIFIERS (CLAUDE.md's
// banned-terms list, in identifier form) -- kept as a separate literal
// rather than imported, since eslint.config.mjs pulls in the flat-config
// / plugin toolchain this plain Node script has no reason to load.
//
// CheckOut/CheckIn are handled separately below, NOT in this set: they
// are banned only as the explicit two-word compound "Check Out"/
// "Check In" (a synonym for HandoverOut/HandoverIn) -- never as the
// single English word "checkout", which this codebase already uses
// correctly and extensively for payment checkout (W1/W2, /checkout,
// checkoutReservationGroup -- Stripe's own terminology, a different
// concept entirely). A same-word tokenizer cannot tell those apart, so
// it must not try.
const SIMPLE_BANNED = new Set(
  [
    'Booking',
    'Order',
    'Item',
    'Product',
    'Inventory',
    'User',
    'Role',
    'Permission',
    'Account',
    'Cart',
    'Session',
    'Fulfilled',
    'Escalation',
    'Case',
    'Ticket',
  ].map((w) => w.toLowerCase()),
)

const appRoot = fileURLToPath(new URL('../app/', import.meta.url))

// Splits any identifier-shaped string into its component words --
// PascalCase/camelCase (case-transition boundaries) and kebab-case/
// snake_case (separator characters, already non-letters so they split
// runs on their own) alike. "checkout" (one lowercase run, no internal
// capital) stays a single token; "CheckOutButton" splits into three.
// This is what makes "cart-summary", "cartTotal" and "CartSummary" all
// detectable while "scarter" (a banned word as a raw substring, not a
// whole word) is not -- and, just as important, what keeps "checkout"
// (the payment term, single word) from ever being torn into "check" +
// "out" in the first place.
function tokenize(text) {
  const runs = text.match(/[A-Za-z]+/g) ?? []
  const words = []
  for (const run of runs) {
    words.push(...(run.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])/g) ?? [run]))
  }
  return words
}

function bannedWordsIn(text) {
  return tokenize(text).filter((word) => SIMPLE_BANNED.has(word.toLowerCase()))
}

// The CheckOut/CheckIn compound: banned only when "check" and "out"/"in"
// come out of tokenize() as two ADJACENT words -- i.e. they were visibly
// separate to begin with (a separator, or an internal capital) -- never
// when they were the single fused word "checkout"/"checkin" that
// tokenize() itself never splits.
function hasBannedCheckCompound(text) {
  const words = tokenize(text)
  return words.some(
    (word, i) => word.toLowerCase() === 'check' && ['out', 'in'].includes(words[i + 1]?.toLowerCase()),
  )
}

function violationsIn(text) {
  const hits = bannedWordsIn(text)
  if (hasBannedCheckCompound(text)) hits.push('CheckOut/CheckIn')
  return hits
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, files)
    else files.push(full)
  }
  return files
}

const failures = []

for (const file of walk(appRoot)) {
  const ext = extname(file)
  const name = basename(file, ext)

  const nameHits = violationsIn(name)
  if (nameHits.length > 0) {
    failures.push(`${file}: banned term in filename (${nameHits.join(', ')})`)
  }

  if (ext !== '.vue' && ext !== '.ts') continue

  const content = readFileSync(file, 'utf8')
  // Static class="..." / :class="[...]" strings -- id-denylist never
  // sees these; they are plain template text, not JS identifiers.
  const classAttrPattern = /:?class="([^"]*)"/g
  let match
  while ((match = classAttrPattern.exec(content))) {
    const hits = violationsIn(match[1])
    if (hits.length > 0) {
      failures.push(`${file}: banned term in class attribute "${match[1]}" (${hits.join(', ')})`)
    }
  }
}

// app/i18n/sk.ts: scans every line's key position specifically (not the
// Slovak values, which are natural-language text where this word-level
// check would otherwise risk an unrelated false positive).
const skPath = join(appRoot, 'i18n', 'sk.ts')
const skContent = readFileSync(skPath, 'utf8')
skContent.split('\n').forEach((line, index) => {
  const keyMatch = /^\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?\s*:/.exec(line)
  if (!keyMatch) return
  const hits = violationsIn(keyMatch[1])
  if (hits.length > 0) {
    failures.push(`app/i18n/sk.ts:${index + 1}: banned term in i18n key "${keyMatch[1]}" (${hits.join(', ')})`)
  }
})

if (failures.length > 0) {
  console.error('Banned-terms check failed (D-34/D-44):')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log('Banned-terms check passed (app/**).')
