// Tool recommendation's data access (D-64). Every method takes the Tenant
// first (FR-33). No method ever receives a raw IP: only the HMAC key.
import type postgres from 'postgres'
import type { TenantId } from '../_shared'
import type { ProviderCost, ProviderUsage, VisitorQuestion } from './types'

export interface ToolRecommendationRepository {
  // The day's secret, created with `candidate` if the day has none yet.
  getOrCreateVisitorSecret(tenantId: TenantId, utcDay: string, candidate: string): Promise<string>
  // Records one call for the key and returns the counts including it.
  recordVisitorCallAndCount(
    tenantId: TenantId,
    visitorKey: string,
    now: Date,
  ): Promise<{ lastHour: number; lastDay: number }>
  // Millionths of a dollar spent in the current month of the Tenant's zone.
  sumCostThisMonth(tenantId: TenantId, timeZone: string): Promise<number>
  insertUsage(tenantId: TenantId, params: { model: string; usage: ProviderUsage; cost: ProviderCost }): Promise<void>
  insertQuestion(tenantId: TenantId, params: { questionText: string; recommendedAssetTypeIds: number[] }): Promise<void>
  listRecentQuestions(tenantId: TenantId, limit: number): Promise<VisitorQuestion[]>
  purgeExpired(
    tenantId: TenantId,
    params: { questionsBefore: Date; visitorCallsBefore: Date; currentUtcDay: string },
  ): Promise<{ questions: number; visitorCalls: number; visitorSecrets: number }>
}

export function createPostgresToolRecommendationRepository(sql: postgres.Sql): ToolRecommendationRepository {
  return {
    async getOrCreateVisitorSecret(tenantId, utcDay, candidate) {
      await sql`
        insert into tool_recommendation_visitor_secrets (tenant_id, utc_day, secret)
        values (${tenantId}, ${utcDay}, ${candidate})
        on conflict (tenant_id, utc_day) do nothing
      `
      const rows = await sql<{ secret: string }[]>`
        select secret from tool_recommendation_visitor_secrets
        where tenant_id = ${tenantId} and utc_day = ${utcDay}
      `
      return rows[0]!.secret
    },

    async recordVisitorCallAndCount(tenantId, visitorKey, now) {
      const rows = await sql<{ last_hour: number; last_day: number }[]>`
        with inserted as (
          insert into tool_recommendation_visitor_calls (tenant_id, visitor_key, called_at)
          values (${tenantId}, ${visitorKey}, ${now})
          returning called_at
        )
        select
          (select count(*) from tool_recommendation_visitor_calls
            where tenant_id = ${tenantId} and visitor_key = ${visitorKey}
              and called_at > ${now}::timestamptz - interval '1 hour')::int + 1 as last_hour,
          (select count(*) from tool_recommendation_visitor_calls
            where tenant_id = ${tenantId} and visitor_key = ${visitorKey}
              and called_at > ${now}::timestamptz - interval '24 hours')::int + 1 as last_day
        from inserted
      `
      // The CTE's insert is not visible to the sibling selects in the same
      // statement, hence the "+ 1" for the call just recorded.
      return { lastHour: rows[0]!.last_hour, lastDay: rows[0]!.last_day }
    },

    async sumCostThisMonth(tenantId, timeZone) {
      const rows = await sql<{ total: string | null }[]>`
        select sum(cost_micro_units)::text as total
        from tool_recommendation_usage
        where tenant_id = ${tenantId}
          and recorded_at >= (date_trunc('month', now() at time zone ${timeZone}) at time zone ${timeZone})
      `
      return Number(rows[0]?.total ?? 0)
    },

    async insertUsage(tenantId, { model, usage, cost }) {
      await sql`
        insert into tool_recommendation_usage (
          tenant_id, model, input_tokens, output_tokens,
          cache_creation_input_tokens, cache_read_input_tokens, cost_micro_units, cost_currency
        ) values (
          ${tenantId}, ${model}, ${usage.inputTokens}, ${usage.outputTokens},
          ${usage.cacheCreationInputTokens}, ${usage.cacheReadInputTokens}, ${cost.microUnits}, ${cost.currency}
        )
      `
    },

    async insertQuestion(tenantId, { questionText, recommendedAssetTypeIds }) {
      await sql`
        insert into tool_recommendation_questions (tenant_id, question_text, recommended_asset_type_ids)
        values (${tenantId}, ${questionText}, ${recommendedAssetTypeIds})
      `
    },

    async listRecentQuestions(tenantId, limit) {
      const rows = await sql<
        { id: number; question_text: string; recommended_asset_type_ids: number[]; recorded_at: Date }[]
      >`
        select id, question_text, recommended_asset_type_ids, recorded_at
        from tool_recommendation_questions
        where tenant_id = ${tenantId}
        order by recorded_at desc, id desc
        limit ${limit}
      `
      return rows.map((row) => ({
        id: row.id,
        tenantId,
        questionText: row.question_text,
        recommendedAssetTypeIds: row.recommended_asset_type_ids,
        recordedAt: row.recorded_at,
      }))
    },

    async purgeExpired(tenantId, { questionsBefore, visitorCallsBefore, currentUtcDay }) {
      const questions = await sql`
        delete from tool_recommendation_questions
        where tenant_id = ${tenantId} and recorded_at < ${questionsBefore}
      `
      const visitorCalls = await sql`
        delete from tool_recommendation_visitor_calls
        where tenant_id = ${tenantId} and called_at < ${visitorCallsBefore}
      `
      // Every earlier day's secret: the key has rotated, and with the
      // secret gone yesterday's keys can never be recomputed.
      const visitorSecrets = await sql`
        delete from tool_recommendation_visitor_secrets
        where tenant_id = ${tenantId} and utc_day < ${currentUtcDay}::date
      `
      return { questions: questions.count, visitorCalls: visitorCalls.count, visitorSecrets: visitorSecrets.count }
    },
  }
}
