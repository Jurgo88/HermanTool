import { describe, expect, it } from 'vitest'
import { checkDatabaseHealth } from '../../server/utils/db-health'

describe('checkDatabaseHealth', () => {
  it('reports credentials_missing when the connection string is absent', async () => {
    const result = await checkDatabaseHealth('')

    expect(result.status).toBe('credentials_missing')
  })

  it('reports connected when the ping succeeds, without touching the network', async () => {
    const result = await checkDatabaseHealth('postgres://example', async () => {})

    expect(result.status).toBe('connected')
  })

  it('reports not_connected when the ping throws, and never throws itself', async () => {
    const result = await checkDatabaseHealth('postgres://example', async () => {
      throw new Error('network unreachable')
    })

    expect(result.status).toBe('not_connected')
    expect(result.message).toContain('network unreachable')
  })
})
