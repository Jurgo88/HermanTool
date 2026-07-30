import { getHeader, readRawBody } from 'h3'
import { issueCustomerAccessLink } from '../../contexts/customer-identity-compliance'
import { createAvailabilityReservationDeps } from '../../utils/availability-reservation-deps'
import { createCustomerIdentityComplianceDeps } from '../../utils/customer-identity-compliance-deps'
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
// here, right after. Actual email dispatch is #35/Notification's job,
// not built yet — the token exists and is ready for it; this route does
// not fail the webhook if issuance has a problem finding the Customer,
// since the Payment/Reservation side has already committed by this point.
export default defineEventHandler(async (event) => {
  const rawBody = (await readRawBody(event, 'utf8')) ?? ''
  const signature = getHeader(event, 'stripe-signature')

  const availability = createAvailabilityReservationDeps(event)
  const payments = createPaymentsDeps(event)
  const customerIdentity = createCustomerIdentityComplianceDeps(event)

  try {
    const tenantId = await getSeededTenantId(availability.sql)
    const webhookEvent = payments.gateway.parseWebhookEvent(rawBody, signature)
    const outcome = await applyProviderWebhookEvent(
      { tenantId, paymentsRepo: payments.repo, gateway: payments.gateway, availabilityRepo: availability.repo },
      webhookEvent,
    )

    if (outcome.outcome === 'confirmed') {
      const customer = await customerIdentity.repo.getCustomerByReservationGroup(
        tenantId,
        outcome.payment.reservationGroupId,
      )
      if (customer) {
        await issueCustomerAccessLink(customerIdentity.repo, { tenantId, customerId: customer.id })
      }
    }

    return { outcome: outcome.outcome }
  } catch (err) {
    translatePaymentsError(err)
  } finally {
    await Promise.all([availability.close(), payments.close(), customerIdentity.close()])
  }
})
