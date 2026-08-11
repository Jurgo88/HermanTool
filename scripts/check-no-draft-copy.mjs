#!/usr/bin/env node
// D-52 (UI-D-10): legally blocked copy (OQ #1 terms and pre-contractual
// information, cancellation, FR-38/D-42/IR-13 privacy text) lives in
// app/i18n/sk.ts under a `draft.` prefix. Run via `pnpm check:no-draft-copy`;
// fails while any `sk.draft.*` key is still referenced anywhere in app/.
//
// NOT currently wired into `pnpm build` -- by request, since real terms
// content is still pending from the Tenant's lawyer and blocking every
// deploy on that in the meantime isn't wanted yet. Re-wire it by
// prefixing package.json's "build" script with
// `node scripts/check-no-draft-copy.mjs && ` once that changes.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = fileURLToPath(new URL('../app/', import.meta.url))
const draftReferencePattern = /\bsk\.draft\b/

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, files)
    else files.push(full)
  }
  return files
}

const hits = []
for (const file of walk(appRoot)) {
  if (!file.endsWith('.vue') && !file.endsWith('.ts')) continue
  const content = readFileSync(file, 'utf8')
  if (draftReferencePattern.test(content)) hits.push(file)
}

if (hits.length > 0) {
  console.error(
    'Build blocked (D-52): sk.draft.* is still referenced. This copy is legally blocked ' +
      '(OQ #1 / IR-13) and must not reach production silently.',
  )
  for (const file of hits) console.error(`  - ${file}`)
  process.exit(1)
}

console.log('No draft.* copy referenced — safe to build.')
