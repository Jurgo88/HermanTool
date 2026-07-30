// In-memory stand-in for NotificationGateway
// (server/contexts/notification/resend-gateway.ts) — proves
// ./notification.ts against the ACL's interface without calling Resend.
// Deliberately never imports the `resend` package, same as the real
// gateway's callers never see a Resend-shaped type.
import type { NotificationGateway, SendEmailRequest } from '../../../../server/contexts/notification/resend-gateway'

export interface FakeNotificationGateway extends NotificationGateway {
  sentEmails: SendEmailRequest[]
}

export function createFakeNotificationGateway(): FakeNotificationGateway {
  const sentEmails: SendEmailRequest[] = []
  let nextMessageId = 1

  return {
    sentEmails,

    async sendEmail(request) {
      sentEmails.push(request)
      return { providerMessageId: `fake-message-${nextMessageId++}` }
    },
  }
}
