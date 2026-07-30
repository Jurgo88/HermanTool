import { getHeader, readRawBody } from 'h3'
import { issueCustomerAccessLink } from '../../contexts/customer-identity-compliance'
import { dispatchReservationConfirmation } from '../../contexts/notification'
import { createAvailabilityReservationDeps } from '../../utils/availability-reservation-deps'
import { createCustomerIdentityComplianceDeps } from '../../utils/customer-identity-compliance-deps'
import { createNotificationDeps } from '../../utils/notification-deps'
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
//
// D-23/FR-39, issue #31: "emailed at confirmation" — this is the
// confirmation moment (ReservationConfirmed, via applyProviderWebhookEvent's
// 'confirmed' outcome), so the Customer's self-service link is issued
// here, right after.
//
// D-28/FR-32, issue #35: the 'confirmation' NotificationDispatched is
// sent from the exact same spot, reusing the link's own Customer lookup.
// Both this and the link issuance are wrapped in their own try/catch,
// deliberately outside the outer one: `outcome.outcome === 'confirmed'`
// only happens once, on the transition edge — a redelivered Stripe event
// finds the Payment already 'succeeded' and reports 'already_processed'
// instead, so this branch never runs again for the same event. A failure
// here would therefore never get a useful retry from Stripe; returning
// an error status would only burn Stripe's retry budget for no benefit,
// so it is logged and swallowed instead — the Payment/Reservation side
// has already committed correctly by this point regardless.
export default defineEventHandler(async (event) => {
  const rawBody = (await readRawBody(event, 'utf8')) ?? ''
  const signature = getHeader(event, 'stripe-signature')

  const availability = createAvailabilityReservationDeps(event)
  const payments = createPaymentsDeps(event)
  const customerIdentity = createCustomerIdentityComplianceDeps(event)
  const notification = createNotificationDeps(event)

  try {
    const tenantId = await getSeededTenantId(availability.sql)
    const webhookEvent = payments.gateway.parseWebhookEvent(rawBody, signature)
    const outcome = await applyProviderWebhookEvent(
      { tenantId, paymentsRepo: payments.repo, gateway: payments.gateway, availabilityRepo: availability.repo },
      webhookEvent,
    )

    if (outcome.outcome === 'confirmed') {
      try {
        const customer = await customerIdentity.repo.getCustomerByReservationGroup(
          tenantId,
          outcome.payment.reservationGroupId,
        )
        if (customer) {
          await issueCustomerAccessLink(customerIdentity.repo, { tenantId, customerId: customer.id })

          const reservations = await availability.repo.listReservationsForGroup(tenantId, customer.reservationGroupId)
          await dispatchReservationConfirmation(
            { repo: notification.repo, gateway: notification.gateway },
            {
              tenantId,
              customerId: customer.id,
              reservationGroupId: customer.reservationGroupId,
              to: customer.email,
              customerName: customer.name,
              lines: reservations.map((r) => ({ assetTypeId: r.assetTypeId, startDay: r.period.startDay, endDay: r.period.endDay })),
            },
          )
        }
      } catch (sideEffectErr) {
        console.error('Post-confirmation side effects (access link / confirmation email) failed:', sideEffectErr)
      }
    }

    return { outcome: outcome.outcome }
  } catch (err) {
    translatePaymentsError(err)
  } finally {
    await Promise.all([availability.close(), payments.close(), customerIdentity.close(), notification.close()])
  }
})
