import { getHeader, readRawBody } from 'h3'
import { createAvailabilityReservationDeps } from '../../utils/availability-reservation-deps'
import { applyProviderWebhookEvent } from '../../utils/payment-webhook-flow'
import { createPaymentsDeps, translatePaymentsError } from '../../utils/payments-deps'
import { getSeededTenantId } from '../../utils/tenant'

// D-26, NFR-05, D-37/Finding 3: Stripe calls this directly — no Operator
// session and no internal-job secret; the gateway's signature
// verification (server/contexts/payments/gateway.ts) IS the
// authentication for this route. The RAW body is read deliberately —
// Stripe's signature is computed over the exact bytes it sent, and
// readValidatedBody's JSON parse would not round-trip identically for
// verification.
//
// Orchestration itself lives in server/utils/payment-webhook-flow.ts
// (the composition root for D-37's confirm-or-refund logic), not here —
// this handler is deliberately thin: parse, delegate, translate errors.
export default defineEventHandler(async (event) => {
  const rawBody = (await readRawBody(event, 'utf8')) ?? ''
  const signature = getHeader(event, 'stripe-signature')

  const availability = createAvailabilityReservationDeps(event)
  const payments = createPaymentsDeps(event)

  try {
    const tenantId = await getSeededTenantId(availability.sql)
    const webhookEvent = payments.gateway.parseWebhookEvent(rawBody, signature)
    const outcome = await applyProviderWebhookEvent(
      { tenantId, paymentsRepo: payments.repo, gateway: payments.gateway, availabilityRepo: availability.repo },
      webhookEvent,
    )
    return { outcome: outcome.outcome }
  } catch (err) {
    translatePaymentsError(err)
  } finally {
    await Promise.all([availability.close(), payments.close()])
  }
})
