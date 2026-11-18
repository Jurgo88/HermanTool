import { describe, expect, it } from 'vitest'
import { RecommendationUnavailableError } from '../../../../server/contexts/tool-recommendation'
import {
  buildMessagesRequestBody,
  createAnthropicRecommendationGateway,
  parseMessagesResponse,
} from '../../../../server/contexts/tool-recommendation/model-gateway'

const request = { instructions: 'RULES', catalog: 'CATALOG', question: 'Vyvŕtať dieru do betónu' }

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('Anthropic recommendation gateway (D-64, D-25)', () => {
  it('puts the cache breakpoint on the catalog and the question after it, with structured output', () => {
    const body = buildMessagesRequestBody('claude-haiku-5-5', request)
    expect(body.model).toBe('claude-haiku-5-5')
    expect(body.system).toEqual([
      { type: 'text', text: 'RULES' },
      { type: 'text', text: 'CATALOG', cache_control: { type: 'ephemeral' } },
    ])
    expect(body.messages).toEqual([{ role: 'user', content: 'Vyvŕtať dieru do betónu' }])
    expect(body.output_config.format.type).toBe('json_schema')
    expect(body.output_config.effort).toBe('low')
  })

  it('reads the structured answer and the usage, including cache reads', () => {
    const parsed = parseMessagesResponse(
      {
        model: 'claude-haiku-5-5',
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: '{"recommendations":[{"assetTypeId":3,"reason":"Do betónu."}],"safetyNote":""}' }],
        usage: { input_tokens: 40, output_tokens: 30, cache_creation_input_tokens: 0, cache_read_input_tokens: 3900 },
      },
      'fallback',
    )
    expect(parsed.output).toEqual({ recommendations: [{ assetTypeId: 3, reason: 'Do betónu.' }], safetyNote: '' })
    expect(parsed.usage).toEqual({ inputTokens: 40, outputTokens: 30, cacheCreationInputTokens: 0, cacheReadInputTokens: 3900 })
  })

  it('treats a refusal, a cut-off answer or a malformed answer as no answer — usage still counted', () => {
    const usage = { input_tokens: 10, output_tokens: 5 }
    expect(parseMessagesResponse({ stop_reason: 'refusal', content: [], usage }, 'm').output).toBeNull()
    expect(parseMessagesResponse({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"rec' }], usage }, 'm').output).toBeNull()
    expect(parseMessagesResponse({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'nie JSON' }], usage }, 'm').output).toBeNull()
    expect(
      parseMessagesResponse(
        { stop_reason: 'end_turn', content: [{ type: 'text', text: '{"recommendations":[{"assetTypeId":"3"}],"safetyNote":""}' }], usage },
        'm',
      ).output,
    ).toBeNull()
    expect(parseMessagesResponse({ stop_reason: 'refusal', content: [], usage }, 'm').usage.inputTokens).toBe(10)
  })

  it('sends the key only in the x-api-key header to the Messages endpoint', async () => {
    let seen: { url: string; init: RequestInit } | undefined
    const gateway = createAnthropicRecommendationGateway({
      apiKey: 'sk-test',
      model: 'claude-haiku-5-5',
      fetchImpl: (async (url: string, init: RequestInit) => {
        seen = { url, init }
        return jsonResponse(200, { stop_reason: 'end_turn', content: [{ type: 'text', text: '{"recommendations":[],"safetyNote":""}' }], usage: {} })
      }) as unknown as typeof fetch,
    })
    const response = await gateway.recommend(request)
    expect(response.output).toEqual({ recommendations: [], safetyNote: '' })
    expect(seen!.url).toBe('https://api.anthropic.com/v1/messages')
    const headers = seen!.init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('sk-test')
    expect(headers['anthropic-version']).toBeTruthy()
    expect(String(seen!.init.body)).not.toContain('sk-test')
  })

  it('turns a missing key, an HTTP error or a network failure into RecommendationUnavailableError', async () => {
    const noKey = createAnthropicRecommendationGateway({ apiKey: '', model: 'claude-haiku-5-5' })
    await expect(noKey.recommend(request)).rejects.toBeInstanceOf(RecommendationUnavailableError)

    for (const status of [400, 401, 429, 500, 529]) {
      const gateway = createAnthropicRecommendationGateway({
        apiKey: 'k',
        model: 'claude-haiku-5-5',
        fetchImpl: (async () => jsonResponse(status, { type: 'error' })) as unknown as typeof fetch,
      })
      await expect(gateway.recommend(request)).rejects.toBeInstanceOf(RecommendationUnavailableError)
    }

    const offline = createAnthropicRecommendationGateway({
      apiKey: 'k',
      model: 'claude-haiku-5-5',
      fetchImpl: (async () => {
        throw new TypeError('fetch failed')
      }) as unknown as typeof fetch,
    })
    await expect(offline.recommend(request)).rejects.toBeInstanceOf(RecommendationUnavailableError)
  })
})
