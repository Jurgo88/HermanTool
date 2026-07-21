import { checkDatabaseHealth } from '../utils/db-health'

// Attempts the direct Postgres connection and reports status instead of
// crashing when the connection string is absent — no live database is
// available yet (scaffold issue).
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)

  const database = await checkDatabaseHealth(config.databaseUrl)

  return {
    status: 'ok',
    database,
  }
})
