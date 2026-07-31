// The anti-corruption layer itself (D-28). This is the ONLY file in the
// codebase allowed to import the `resend` package or reference a Resend
// concept by name — mirrors server/contexts/payments/gateway.ts's own
// framing for Stripe. Every export here speaks in this context's own
// vocabulary (a plain email send, an opaque provider message id) so that
// ./notification.ts and every caller stay ignorant of which provider is
// behind it — D-28's own migration note: "four named message kinds... a
// day's work" to switch providers, which is only true if nothing outside
// this file knows Resend exists.
import { Resend } from 'resend'
import { NotificationSendFailedError } from './types'

export interface SendEmailRequest {
  to: string
  subject: string
  text: string
}

export interface NotificationGateway {
  sendEmail(request: SendEmailRequest): Promise<{ providerMessageId: string }>
}

export function createResendNotificationGateway(params: { apiKey: string; fromAddress: string }): NotificationGateway {
  const resend = new Resend(params.apiKey)

  return {
    async sendEmail({ to, subject, text }) {
      const result = await resend.emails.send({ from: params.fromAddress, to, subject, text })
      if (result.error) throw new NotificationSendFailedError(result.error.message)
      // Resend's SDK types `data` as nullable alongside `error` even on
      // the success branch — unreachable in practice once `error` is
      // null, kept as a checked invariant rather than a silent `!`.
      if (!result.data) throw new NotificationSendFailedError('Resend returned no data and no error.')
      return { providerMessageId: result.data.id }
    },
  }
}
