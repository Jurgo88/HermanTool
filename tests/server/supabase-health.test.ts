import { describe, expect, it } from 'vitest'
import { checkSupabaseHealth } from '../../server/utils/supabase-health'

describe('checkSupabaseHealth', () => {
  it('reports credentials_missing when the url or anon key is absent', async () => {
    const result = await checkSupabaseHealth({ url: '', anonKey: '' })

    expect(result.status).toBe('credentials_missing')
  })

  it('reports credentials_missing when only one of the two is set', async () => {
    const result = await checkSupabaseHealth({ url: 'https://example.supabase.co', anonKey: '' })

    expect(result.status).toBe('credentials_missing')
  })

  it('reports connected when the ping succeeds, without touching the network', async () => {
    const result = await checkSupabaseHealth(
      { url: 'https://example.supabase.co', anonKey: 'anon-key' },
      async () => {},
    )

    expect(result.status).toBe('connected')
  })

  it('reports not_connected when the ping throws, and never throws itself', async () => {
    const result = await checkSupabaseHealth(
      { url: 'https://example.supabase.co', anonKey: 'anon-key' },
      async () => {
        throw new Error('network unreachable')
      },
    )

    expect(result.status).toBe('not_connected')
    expect(result.message).toContain('network unreachable')
  })
})
