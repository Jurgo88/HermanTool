// Integration tests for 20261120090000_tool_recommendation against a real
// Postgres: visitor-call windows, the month sum, the purge and Tenant
// scoping (D-64, FR-33).
//
// Self-skips when NUXT_DATABASE_URL is not set. Point it at a local or
// rehearsal database, never at production: it deletes rows.
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import type postgres from 'postgres'
import { createDatabaseClient } from '../../../../server/utils/db'
import type { TenantId } from '../../../../server/contexts/_shared'
import { createPostgresToolRecommendationRepository } from '../../../../server/contexts/tool-recommendation'

const databaseUrl = process.env.NUXT_DATABASE_URL ?? ''

describe.skipIf(!databaseUrl)('tool recommendation repository (integration)', () => {
  let sql: postgres.Sql
  let tenantA: TenantId
  let tenantB: TenantId

  beforeEach(async () => {
    sql = createDatabaseClient(databaseUrl)
    await sql`
      truncate table tool_recommendation_questions, tool_recommendation_usage,
        tool_recommendation_visitor_calls, tool_recommendation_visitor_secrets restart identity
    `
    const [{ id: seeded }] = await sql<{ id: string }[]>`select id from tenants order by created_at limit 1`
    tenantA = seeded as TenantId
    const [{ id: second }] = await sql<{ id: string }[]>`insert into tenants default values returning id`
    tenantB = second as TenantId
  })

  afterEach(async () => {
    for (const table of [
      'tool_recommendation_questions',
      'tool_recommendation_usage',
      'tool_recommendation_visitor_calls',
      'tool_recommendation_visitor_secrets',
    ]) {
      await sql`delete from ${sql(table)} where tenant_id = ${tenantB}`
    }
    await sql`delete from tenants where id = ${tenantB}`
  })

  afterAll(async () => {
    await sql?.end()
  })

  it('keeps one secret per Tenant and UTC day', async () => {
    const repo = createPostgresToolRecommendationRepository(sql)
    expect(await repo.getOrCreateVisitorSecret(tenantA, '2026-11-20', 'first')).toBe('first')
    expect(await repo.getOrCreateVisitorSecret(tenantA, '2026-11-20', 'second')).toBe('first')
    expect(await repo.getOrCreateVisitorSecret(tenantB, '2026-11-20', 'other')).toBe('other')
  })

  it('counts calls in the last hour and day, per Tenant and key, including this one', async () => {
    const repo = createPostgresToolRecommendationRepository(sql)
    const now = new Date('2026-11-20T10:00:00Z')
    await repo.recordVisitorCallAndCount(tenantA, 'k', new Date('2026-11-19T12:00:00Z'))
    await repo.recordVisitorCallAndCount(tenantA, 'k', new Date('2026-11-20T09:30:00Z'))
    await repo.recordVisitorCallAndCount(tenantB, 'k', new Date('2026-11-20T09:45:00Z'))
    expect(await repo.recordVisitorCallAndCount(tenantA, 'k', now)).toEqual({ lastHour: 2, lastDay: 3 })
  })

  it("sums this month's cost for the Tenant only", async () => {
    const repo = createPostgresToolRecommendationRepository(sql)
    const usage = { inputTokens: 1, outputTokens: 1, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 }
    await repo.insertUsage(tenantA, { model: 'm', usage, cost: { microUnits: 400, currency: 'USD' } })
    await repo.insertUsage(tenantA, { model: 'm', usage, cost: { microUnits: 600, currency: 'USD' } })
    await repo.insertUsage(tenantB, { model: 'm', usage, cost: { microUnits: 9_000, currency: 'USD' } })
    await sql`
      insert into tool_recommendation_usage (tenant_id, model, input_tokens, output_tokens, cost_micro_units, cost_currency, recorded_at)
      values (${tenantA}, 'm', 1, 1, 5000, 'USD', now() - interval '45 days')
    `
    expect(await repo.sumCostThisMonth(tenantA, 'Europe/Bratislava')).toBe(1000)
  })

  it('purges questions after 90 days, calls after 24 h, earlier day secrets — Tenant-scoped', async () => {
    const repo = createPostgresToolRecommendationRepository(sql)
    await sql`
      insert into tool_recommendation_questions (tenant_id, question_text, recommended_asset_type_ids, recorded_at) values
        (${tenantA}, 'stará', '{}', ${new Date('2026-08-20T09:00:00Z')}),
        (${tenantA}, 'nová', '{3}', ${new Date('2026-08-23T09:00:00Z')}),
        (${tenantB}, 'iný', '{}', ${new Date('2026-08-20T09:00:00Z')})
    `
    await repo.recordVisitorCallAndCount(tenantA, 'k', new Date('2026-11-19T09:00:00Z'))
    await repo.recordVisitorCallAndCount(tenantA, 'k', new Date('2026-11-19T11:00:00Z'))
    await repo.getOrCreateVisitorSecret(tenantA, '2026-11-19', 'old')
    await repo.getOrCreateVisitorSecret(tenantA, '2026-11-20', 'today')

    const purged = await repo.purgeExpired(tenantA, {
      questionsBefore: new Date('2026-08-22T10:00:00Z'),
      visitorCallsBefore: new Date('2026-11-19T10:00:00Z'),
      currentUtcDay: '2026-11-20',
    })
    expect(purged).toEqual({ questions: 1, visitorCalls: 1, visitorSecrets: 1 })
    expect((await repo.listRecentQuestions(tenantA, 10)).map((q) => q.questionText)).toEqual(['nová'])
    expect(await repo.listRecentQuestions(tenantB, 10)).toHaveLength(1)
  })

  it('refuses a question longer than 500 characters at the database too', async () => {
    const repo = createPostgresToolRecommendationRepository(sql)
    await expect(repo.insertQuestion(tenantA, { questionText: 'x'.repeat(501), recommendedAssetTypeIds: [] })).rejects.toThrow()
  })
})
