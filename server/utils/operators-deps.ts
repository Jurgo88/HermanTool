// H3/Nuxt-specific glue around ./operators.ts's pure repository factory:
// runtime config resolution and connection lifecycle. Kept in its own
// file — not in ./operators.ts itself — for the same reason
// ./availability-reservation-deps.ts is separate from
// ../contexts/availability-reservation/repository.ts: ./operators.ts
// must stay importable from a plain Vitest run with no Nuxt build
// context, and `useRuntimeConfig` (from '#imports') only resolves inside
// one.
import type { H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import { createDatabaseClient } from './db'
import { createPostgresOperatorRepository, type OperatorRepository } from './operators'

// Lighter than ./operator-session.ts's createAuthDeps: routes that only
// need PIN verification (./operator-pin.ts) have no reason to also
// construct a Supabase Auth client — R-08/NFR-02 apply the same "keep
// this endpoint's imports light" discipline here as they do to the
// scan-to-resolution path.
export function createOperatorsDeps(event: H3Event): { repo: OperatorRepository; close: () => Promise<void> } {
  const config = useRuntimeConfig(event)
  const sql = createDatabaseClient(config.databaseUrl)
  return { repo: createPostgresOperatorRepository(sql), close: () => sql.end() }
}
