// The anti-corruption layer for the language-model provider (D-64), in the
// same role resend-gateway.ts plays for e-mail (D-28). The ONLY file that
// names Anthropic or knows the Messages API's shape; everything outside it
// speaks of a question, a catalog and a raw answer.
//
// Plain fetch against the documented HTTP API, not the SDK: no new
// dependency was added for #214. Swapping to @anthropic-ai/sdk later
// changes this file only.
//
// Request shape:
// - the stable prefix (instructions, then the catalog) is the system
//   prompt, with the cache breakpoint on the catalog block, so every
//   question after the first reads it from the cache;
// - the Visitor's question is the only user message, after the breakpoint;
// - structured output (output_config.format) constrains the answer to
//   the JSON shape below; the server still validates every id;
// - effort "low": choosing from ~44 entries is a simple task.
import { RecommendationUnavailableError, type ProviderUsage } from './types'

const MESSAGES_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2026-10-21'
const REQUEST_TIMEOUT_MS = 20_000
const MAX_TOKENS = 2048

export interface RawRecommendationOutput {
  recommendations: { assetTypeId: number; reason: string }[]
  safetyNote: string
}

export interface RecommendationModelRequest {
  instructions: string
  catalog: string
  question: string
}

export interface RecommendationModelResponse {
  // null when the model declined, ran out of tokens or answered
  // something that is not the agreed shape — the caller then shows the
  // "we will advise you in person" result. The call is still billed.
  output: RawRecommendationOutput | null
  usage: ProviderUsage
  model: string
}

export interface RecommendationModelGateway {
  recommend(request: RecommendationModelRequest): Promise<RecommendationModelResponse>
}

export const RECOMMENDATION_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['recommendations', 'safetyNote'],
  properties: {
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['assetTypeId', 'reason'],
        properties: {
          assetTypeId: { type: 'integer' },
          reason: { type: 'string' },
        },
      },
    },
    safetyNote: { type: 'string' },
  },
} as const

interface MessagesApiResponse {
  model?: string
  stop_reason?: string | null
  content?: { type: string; text?: string }[]
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_creation_input_tokens?: number | null
    cache_read_input_tokens?: number | null
  }
}

export function buildMessagesRequestBody(model: string, request: RecommendationModelRequest) {
  return {
    model,
    max_tokens: MAX_TOKENS,
    system: [
      { type: 'text', text: request.instructions },
      { type: 'text', text: request.catalog, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: request.question }],
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: RECOMMENDATION_OUTPUT_SCHEMA },
    },
  }
}

export function parseMessagesResponse(body: MessagesApiResponse, fallbackModel: string): RecommendationModelResponse {
  const usage: ProviderUsage = {
    inputTokens: body.usage?.input_tokens ?? 0,
    outputTokens: body.usage?.output_tokens ?? 0,
    cacheCreationInputTokens: body.usage?.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: body.usage?.cache_read_input_tokens ?? 0,
  }
  const model = body.model ?? fallbackModel

  // A refusal or a cut-off answer is not an answer (check stop_reason
  // before reading content).
  if (body.stop_reason !== 'end_turn') return { output: null, usage, model }

  const text = (body.content ?? [])
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
  try {
    const parsed = JSON.parse(text) as unknown
    if (!isRawOutput(parsed)) return { output: null, usage, model }
    return { output: parsed, usage, model }
  } catch {
    return { output: null, usage, model }
  }
}

function isRawOutput(value: unknown): value is RawRecommendationOutput {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  if (typeof candidate.safetyNote !== 'string' || !Array.isArray(candidate.recommendations)) return false
  return candidate.recommendations.every(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      Number.isInteger((entry as Record<string, unknown>).assetTypeId) &&
      typeof (entry as Record<string, unknown>).reason === 'string',
  )
}

export function createAnthropicRecommendationGateway(params: {
  apiKey: string
  model: string
  fetchImpl?: typeof fetch
}): RecommendationModelGateway {
  const doFetch = params.fetchImpl ?? fetch
  return {
    async recommend(request) {
      if (!params.apiKey) throw new RecommendationUnavailableError('no API key configured')
      if (!params.model) throw new RecommendationUnavailableError('no model configured')

      let response: Response
      try {
        response = await doFetch(MESSAGES_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': params.apiKey,
            'anthropic-version': API_VERSION,
          },
          body: JSON.stringify(buildMessagesRequestBody(params.model, request)),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
      } catch (err) {
        throw new RecommendationUnavailableError(err instanceof Error ? err.message : String(err))
      }

      // Every HTTP error (400 bad request, 401/403 key, 429 rate limit,
      // 5xx/529 overloaded) means no answer for this Visitor; the route
      // shows the filters instead. No retry: the Visitor can ask again.
      if (!response.ok) {
        throw new RecommendationUnavailableError(`provider answered HTTP ${response.status}`)
      }

      let body: MessagesApiResponse
      try {
        body = (await response.json()) as MessagesApiResponse
      } catch {
        throw new RecommendationUnavailableError('provider answered with an unreadable body')
      }
      return parseMessagesResponse(body, params.model)
    },
  }
}
