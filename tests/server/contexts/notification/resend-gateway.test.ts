import { afterEach, describe, expect, it, vi } from 'vitest'
import { createResendNotificationGateway } from '../../../../server/contexts/notification/resend-gateway'
import { NotificationSendFailedError } from '../../../../server/contexts/notification/types'

describe('createResendNotificationGateway without a configured key', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('can be built, so a caller that never sends is not blocked', () => {
    expect(() => createResendNotificationGateway({ apiKey: '', fromAddress: '' })).not.toThrow()
  })

  it('a send fails with the typed notification error', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const gateway = createResendNotificationGateway({ apiKey: '', fromAddress: '' })

    await expect(
      gateway.sendEmail({ to: 'a@example.com', subject: 's', text: 't' }),
    ).rejects.toBeInstanceOf(NotificationSendFailedError)
  })
})
