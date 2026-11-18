// In-memory ToolRecommendationRepository: every collection is keyed by
// Tenant, so a test can prove one Tenant never sees another's rows (FR-33).
import type { TenantId } from '../../../../server/contexts/_shared'
import type {
  ProviderCost,
  ProviderUsage,
  ToolRecommendationRepository,
  VisitorQuestion,
} from '../../../../server/contexts/tool-recommendation'

export interface FakeToolRecommendationRepository extends ToolRecommendationRepository {
  secrets: { tenantId: TenantId; utcDay: string; secret: string }[]
  calls: { tenantId: TenantId; visitorKey: string; calledAt: Date }[]
  usage: { tenantId: TenantId; model: string; usage: ProviderUsage; cost: ProviderCost; recordedAt: Date }[]
  questions: VisitorQuestion[]
  // Overrides "this month's" spend per Tenant, in micro-dollars.
  monthSpend: Map<TenantId, number>
}

export function createFakeToolRecommendationRepository(): FakeToolRecommendationRepository {
  let nextQuestionId = 1
  const repo: FakeToolRecommendationRepository = {
    secrets: [],
    calls: [],
    usage: [],
    questions: [],
    monthSpend: new Map(),

    async getOrCreateVisitorSecret(tenantId, utcDay, candidate) {
      const existing = repo.secrets.find((s) => s.tenantId === tenantId && s.utcDay === utcDay)
      if (existing) return existing.secret
      repo.secrets.push({ tenantId, utcDay, secret: candidate })
      return candidate
    },

    async recordVisitorCallAndCount(tenantId, visitorKey, now) {
      repo.calls.push({ tenantId, visitorKey, calledAt: now })
      const mine = repo.calls.filter((c) => c.tenantId === tenantId && c.visitorKey === visitorKey)
      const since = (ms: number) => mine.filter((c) => c.calledAt.getTime() > now.getTime() - ms).length
      return { lastHour: since(3_600_000), lastDay: since(86_400_000) }
    },

    async sumCostThisMonth(tenantId) {
      const override = repo.monthSpend.get(tenantId)
      if (override !== undefined) return override
      return repo.usage.filter((u) => u.tenantId === tenantId).reduce((sum, u) => sum + u.cost.microUnits, 0)
    },

    async insertUsage(tenantId, params) {
      repo.usage.push({ tenantId, ...params, recordedAt: new Date() })
    },

    async insertQuestion(tenantId, params) {
      repo.questions.push({ id: nextQuestionId++, tenantId, ...params, recordedAt: new Date() })
    },

    async listRecentQuestions(tenantId, limit) {
      return repo.questions
        .filter((q) => q.tenantId === tenantId)
        .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime() || b.id - a.id)
        .slice(0, limit)
    },

    async purgeExpired(tenantId, { questionsBefore, visitorCallsBefore, currentUtcDay }) {
      const before = { q: repo.questions.length, c: repo.calls.length, s: repo.secrets.length }
      repo.questions = repo.questions.filter((q) => q.tenantId !== tenantId || q.recordedAt >= questionsBefore)
      repo.calls = repo.calls.filter((c) => c.tenantId !== tenantId || c.calledAt >= visitorCallsBefore)
      repo.secrets = repo.secrets.filter((s) => s.tenantId !== tenantId || s.utcDay >= currentUtcDay)
      return {
        questions: before.q - repo.questions.length,
        visitorCalls: before.c - repo.calls.length,
        visitorSecrets: before.s - repo.secrets.length,
      }
    },
  }
  return repo
}
