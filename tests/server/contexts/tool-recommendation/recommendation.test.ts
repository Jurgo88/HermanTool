import { beforeEach, describe, expect, it } from 'vitest'
import type { TenantId } from '../../../../server/contexts/_shared'
import {
  DEFAULT_MONTHLY_CAP,
  InvalidRecommendationCapError,
  MonthlyCapReachedError,
  RecommendationQuestionInvalidError,
  RecommendationUnavailableError,
  VisitorLimitReachedError,
  assertValidRecommendationCap,
  computeProviderCost,
  isCapReached,
  isRecommendationAvailable,
  listRecentVisitorQuestions,
  priceOf,
  purgeExpiredRecommendationRecords,
  recommendTools,
  scrubContactDetails,
  type CatalogEntry,
  type RawRecommendationOutput,
  type RecommendationModelGateway,
  type RecommendationModelRequest,
} from '../../../../server/contexts/tool-recommendation'
import {
  deriveVisitorKey,
  renderCatalogPrompt,
  validateRecommendations,
} from '../../../../server/contexts/tool-recommendation/recommendation'
import { createFakeToolRecommendationRepository, type FakeToolRecommendationRepository } from './fake-repository'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId
const tenantB = '22222222-2222-2222-2222-222222222222' as TenantId
const MODEL = 'claude-haiku-5-5'
const NOW = new Date('2026-11-20T10:00:00Z')
const DAY = '2026-11-20'
const IP = '203.0.113.7'

const catalogA: CatalogEntry[] = [
  { id: 3, name: 'Príklepová vŕtačka', description: 'Do betónu a tehly.', powerSource: 'Elektrina', useAreas: ['Stavba'] },
  { id: 5, name: 'Akumulátorový skrutkovač', description: '', powerSource: 'Batéria', useAreas: [] },
  { id: 9, name: 'Vysávač', description: 'Na prach.', powerSource: null, useAreas: ['Upratovanie'] },
]

interface FakeGateway extends RecommendationModelGateway {
  requests: RecommendationModelRequest[]
}

function fakeGateway(output: RawRecommendationOutput | null, model = MODEL): FakeGateway {
  const gateway: FakeGateway = {
    requests: [],
    async recommend(request) {
      gateway.requests.push(request)
      return {
        output,
        model,
        usage: { inputTokens: 300, outputTokens: 120, cacheCreationInputTokens: 0, cacheReadInputTokens: 3800 },
      }
    },
  }
  return gateway
}

describe('tool recommendation (D-64, #214)', () => {
  let repo: FakeToolRecommendationRepository

  beforeEach(() => {
    repo = createFakeToolRecommendationRepository()
  })

  function ask(
    gateway: RecommendationModelGateway,
    overrides: Partial<Parameters<typeof recommendTools>[1]> = {},
  ) {
    return recommendTools(
      { repo, gateway },
      {
        tenantId: tenantA,
        question: 'Potrebujem vyvŕtať dieru do betónu na poličku',
        visitorIp: IP,
        utcDay: DAY,
        now: NOW,
        timeZone: 'Europe/Bratislava',
        model: MODEL,
        monthlyCap: DEFAULT_MONTHLY_CAP,
        catalog: catalogA,
        ...overrides,
      },
    )
  }

  describe('validation of the model answer', () => {
    it('never returns an unpublished, unknown or other-Tenant AssetType id', async () => {
      // 42 is tenant B's AssetType; 77 does not exist; 9 is published for A.
      const gateway = fakeGateway({
        recommendations: [
          { assetTypeId: 42, reason: 'B' },
          { assetTypeId: 77, reason: 'neexistuje' },
          { assetTypeId: 9, reason: 'Vysaje prach po vŕtaní.' },
        ],
        safetyNote: '',
      })
      const result = await ask(gateway)
      expect(result.recommendations).toEqual([{ assetTypeId: 9, reason: 'Vysaje prach po vŕtaní.' }])
    })

    it('keeps at most three, in the model order, without duplicates', () => {
      const result = validateRecommendations(
        {
          recommendations: [
            { assetTypeId: 5, reason: 'a' },
            { assetTypeId: 5, reason: 'dup' },
            { assetTypeId: 3, reason: 'b' },
            { assetTypeId: 9, reason: 'c' },
            { assetTypeId: 1, reason: 'd' },
          ],
          safetyNote: 'Použite okuliare.',
        },
        new Set([1, 3, 5, 9]),
      )
      expect(result.recommendations.map((r) => r.assetTypeId)).toEqual([5, 3, 9])
      expect(result.safetyNote).toBe('Použite okuliare.')
    })

    it('drops the safety note when nothing is recommended, and treats a refusal as no match', () => {
      expect(validateRecommendations({ recommendations: [], safetyNote: 'x' }, new Set([1]))).toEqual({
        recommendations: [],
        safetyNote: null,
      })
      expect(validateRecommendations(null, new Set([1]))).toEqual({ recommendations: [], safetyNote: null })
    })

    it('records usage and the question even when the model declines (the call is billed)', async () => {
      const result = await ask(fakeGateway(null))
      expect(result.recommendations).toEqual([])
      expect(repo.usage).toHaveLength(1)
      expect(repo.questions).toHaveLength(1)
      expect(repo.questions[0]!.recommendedAssetTypeIds).toEqual([])
    })
  })

  describe('FR-33: Tenant scoping', () => {
    it('sends only the given Tenant catalog and stores rows under that Tenant only', async () => {
      const gateway = fakeGateway({ recommendations: [{ assetTypeId: 3, reason: 'Do betónu.' }], safetyNote: '' })
      await ask(gateway)
      expect(gateway.requests[0]!.catalog).toContain('assetTypeId: 3')
      expect(gateway.requests[0]!.catalog).not.toContain('assetTypeId: 42')
      expect(await listRecentVisitorQuestions(repo, { tenantId: tenantA, limit: 10 })).toHaveLength(1)
      expect(await listRecentVisitorQuestions(repo, { tenantId: tenantB, limit: 10 })).toHaveLength(0)
      expect(repo.usage.every((u) => u.tenantId === tenantA)).toBe(true)
    })

    it("counts one Tenant's spend against its own cap only", async () => {
      repo.monthSpend.set(tenantB, 50_000_000)
      const gateway = fakeGateway({ recommendations: [], safetyNote: '' })
      await expect(ask(gateway)).resolves.toBeDefined()
      await expect(ask(gateway, { tenantId: tenantB })).rejects.toBeInstanceOf(MonthlyCapReachedError)
    })
  })

  describe('visitor limits', () => {
    it('refuses the 11th call within an hour', async () => {
      const gateway = fakeGateway({ recommendations: [], safetyNote: '' })
      for (let i = 0; i < 10; i++) await ask(gateway)
      await expect(ask(gateway)).rejects.toEqual(new VisitorLimitReachedError('hour'))
      expect(gateway.requests).toHaveLength(10)
    })

    it('refuses the 31st call within a day', async () => {
      const gateway = fakeGateway({ recommendations: [], safetyNote: '' })
      for (let i = 0; i < 30; i++) {
        // Spread over the day so the hourly limit never trips: 3 calls per hour.
        await ask(gateway, { now: new Date(NOW.getTime() - (30 - i) * 20 * 60_000) })
      }
      await expect(ask(gateway)).rejects.toEqual(new VisitorLimitReachedError('day'))
      expect(gateway.requests).toHaveLength(30)
    })

    it('limits each visitor separately', async () => {
      const gateway = fakeGateway({ recommendations: [], safetyNote: '' })
      for (let i = 0; i < 10; i++) await ask(gateway)
      await expect(ask(gateway, { visitorIp: '198.51.100.1' })).resolves.toBeDefined()
    })

    it('never persists the raw IP — only an HMAC under the day secret', async () => {
      await ask(fakeGateway({ recommendations: [], safetyNote: '' }))
      const persisted = JSON.stringify({ calls: repo.calls, questions: repo.questions, usage: repo.usage })
      expect(persisted).not.toContain(IP)
      expect(repo.calls[0]!.visitorKey).toBe(deriveVisitorKey(IP, repo.secrets[0]!.secret))
      expect(repo.calls[0]!.visitorKey).toMatch(/^[0-9a-f]{64}$/)
    })

    it('derives a different key under a new day secret', () => {
      expect(deriveVisitorKey(IP, 'a'.repeat(64))).not.toBe(deriveVisitorKey(IP, 'b'.repeat(64)))
    })
  })

  describe('monthly cap', () => {
    it('makes no provider call once the cap is reached', async () => {
      repo.monthSpend.set(tenantA, DEFAULT_MONTHLY_CAP.amount * 10_000)
      const gateway = fakeGateway({ recommendations: [], safetyNote: '' })
      await expect(ask(gateway)).rejects.toBeInstanceOf(MonthlyCapReachedError)
      expect(gateway.requests).toHaveLength(0)
      expect(repo.usage).toHaveLength(0)
    })

    it('counts one dollar as one euro (no invented exchange rate)', () => {
      const cap = { amount: 1000, currency: 'EUR' as const }
      expect(isCapReached(9_999_999, cap)).toBe(false)
      expect(isCapReached(10_000_000, cap)).toBe(true)
    })

    it('hides the input when the cap is 0, unconfigured, unpriced or reached', async () => {
      const base = { tenantId: tenantA, configured: true, model: MODEL, monthlyCap: DEFAULT_MONTHLY_CAP, timeZone: 'Europe/Bratislava' }
      expect(await isRecommendationAvailable(repo, base)).toBe(true)
      expect(await isRecommendationAvailable(repo, { ...base, configured: false })).toBe(false)
      expect(await isRecommendationAvailable(repo, { ...base, model: 'unknown-model' })).toBe(false)
      expect(await isRecommendationAvailable(repo, { ...base, monthlyCap: { amount: 0, currency: 'EUR' } })).toBe(false)
      repo.monthSpend.set(tenantA, 10_000_000)
      expect(await isRecommendationAvailable(repo, base)).toBe(false)
    })

    it('validates the cap: whole cents 0–100000, null for the default', () => {
      expect(() => assertValidRecommendationCap(null)).not.toThrow()
      expect(() => assertValidRecommendationCap(0)).not.toThrow()
      expect(() => assertValidRecommendationCap(-1)).toThrow(InvalidRecommendationCapError)
      expect(() => assertValidRecommendationCap(10.5)).toThrow(InvalidRecommendationCapError)
      expect(() => assertValidRecommendationCap(100_001)).toThrow(InvalidRecommendationCapError)
    })
  })

  describe('cost', () => {
    it('prices tokens per the model table, rounded up, in USD', () => {
      const cost = computeProviderCost(
        { inputTokens: 300, outputTokens: 120, cacheCreationInputTokens: 0, cacheReadInputTokens: 3800 },
        priceOf(MODEL)!,
      )
      // 300×0.1 + 120×0.5 + 3800×0.01 = 30 + 60 + 38 = 128 µ$
      expect(cost).toEqual({ microUnits: 128, currency: 'USD' })
    })

    it('refuses a model with no known price before any call', async () => {
      const gateway = fakeGateway({ recommendations: [], safetyNote: '' })
      await expect(ask(gateway, { model: 'claude-unknown' })).rejects.toBeInstanceOf(RecommendationUnavailableError)
      expect(gateway.requests).toHaveLength(0)
    })
  })

  describe('question handling', () => {
    it('refuses an empty or over-long question', async () => {
      const gateway = fakeGateway(null)
      await expect(ask(gateway, { question: '   ' })).rejects.toBeInstanceOf(RecommendationQuestionInvalidError)
      await expect(ask(gateway, { question: 'x'.repeat(501) })).rejects.toBeInstanceOf(RecommendationQuestionInvalidError)
      expect(gateway.requests).toHaveLength(0)
    })

    it('strips e-mail addresses and phone numbers before insert, keeps job numbers', async () => {
      await ask(fakeGateway(null), {
        question: 'Vŕtať 10 mm do betónu, 2 m². Ozvite sa na jan.novak@example.sk alebo +421 905 123 456.',
      })
      const stored = repo.questions[0]!.questionText
      expect(stored).not.toContain('jan.novak@example.sk')
      expect(stored).not.toContain('905 123 456')
      expect(stored).toContain('[e-mail]')
      expect(stored).toContain('[telefón]')
      expect(stored).toContain('10 mm')
      expect(stored).toContain('2 m²')
    })

    it('scrubs common Slovak phone formats', () => {
      expect(scrubContactDetails('0905/123 456')).toBe('[telefón]')
      expect(scrubContactDetails('0905-123-456')).toBe('[telefón]')
      expect(scrubContactDetails('0905123456')).toBe('[telefón]')
      expect(scrubContactDetails('rok 2026')).toBe('rok 2026')
    })

    it('renders the catalog deterministically, ordered by id (stable cache prefix)', () => {
      const shuffled = [catalogA[2]!, catalogA[0]!, catalogA[1]!]
      expect(renderCatalogPrompt(shuffled)).toBe(renderCatalogPrompt(catalogA))
      expect(renderCatalogPrompt(catalogA).indexOf('assetTypeId: 3')).toBeLessThan(
        renderCatalogPrompt(catalogA).indexOf('assetTypeId: 9'),
      )
    })
  })

  describe('purge (D-64, D-41)', () => {
    it('removes questions older than 90 days, calls older than 24 h and earlier day secrets — for its Tenant only', async () => {
      const old = new Date(NOW.getTime() - 91 * 86_400_000)
      const recent = new Date(NOW.getTime() - 89 * 86_400_000)
      repo.questions.push(
        { id: 100, tenantId: tenantA, questionText: 'stará', recommendedAssetTypeIds: [], recordedAt: old },
        { id: 101, tenantId: tenantA, questionText: 'nová', recommendedAssetTypeIds: [], recordedAt: recent },
        { id: 102, tenantId: tenantB, questionText: 'iný Tenant', recommendedAssetTypeIds: [], recordedAt: old },
      )
      repo.calls.push(
        { tenantId: tenantA, visitorKey: 'k', calledAt: new Date(NOW.getTime() - 25 * 3_600_000) },
        { tenantId: tenantA, visitorKey: 'k', calledAt: new Date(NOW.getTime() - 23 * 3_600_000) },
      )
      repo.secrets.push(
        { tenantId: tenantA, utcDay: '2026-11-19', secret: 's1' },
        { tenantId: tenantA, utcDay: DAY, secret: 's2' },
      )

      const purged = await purgeExpiredRecommendationRecords(repo, { tenantId: tenantA, now: NOW, utcDay: DAY })

      expect(purged).toEqual({ questions: 1, visitorCalls: 1, visitorSecrets: 1 })
      expect(repo.questions.map((q) => q.id).sort()).toEqual([101, 102])
      expect(repo.secrets.map((s) => s.utcDay)).toEqual([DAY])
    })
  })
})
