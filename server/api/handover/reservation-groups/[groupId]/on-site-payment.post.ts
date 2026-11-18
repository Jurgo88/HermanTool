import { z } from 'zod'
import { ReservationGroupNotFoundError } from '../../../../contexts/availability-reservation'
import { attestOnSitePayment } from '../../../../contexts/handover-possession'
import {
  createAvailabilityReservationDeps,
  getReservationGroupIdParam,
} from '../../../../utils/availability-reservation-deps'
import {
  createHandoverPossessionDeps,
  translateHandoverPossessionError,
} from '../../../../utils/handover-possession-deps'
import { InvalidPinError, verifyOperatorPin } from '../../../../utils/operator-pin'
import { createOperatorsDeps } from '../../../../utils/operators-deps'
import { requireOperator } from '../../../../utils/operator-session'

const bodySchema = z.object({
  // D-21: an amount always travels with its currency; EUR only in the pilot.
  amount: z.object({ amount: z.number().int().nonnegative(), currency: z.literal('EUR') }),
  method: z.enum(['cash', 'card_terminal', 'qr']),
  // F8/D-22/D-48/FR-36: the PIN resolves WHICH Operator attests.
  pin: z.string().min(1),
  // P1: a correction supersedes the attestation in force, with a reason.
  correction: z
    .object({ supersedesId: z.number().int().positive(), reason: z.string() })
    .optional(),
})

// S-10 (D-65, P6, D-07, FR-34; issue #215): the Operator attests that the
// rental fee was received through the Tenant's eKasa. The platform moves
// no money and issues no receipt. PIN-gated per attestation (D-48).
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const reservationGroupId = getReservationGroupIdParam(event)
  const body = await readValidatedBody(event, bodySchema.parse)

  const availability = createAvailabilityReservationDeps(event)
  const handover = createHandoverPossessionDeps(event)
  const operators = createOperatorsDeps(event)

  try {
    const attestingOperator = await verifyOperatorPin(operators.repo, operator.tenantId, body.pin)
    const group = await availability.repo.getReservationGroup(operator.tenantId, reservationGroupId)
    if (!group) throw new ReservationGroupNotFoundError(reservationGroupId)

    const attested = await attestOnSitePayment(handover.onSitePaymentRepo, {
      tenantId: operator.tenantId,
      group,
      amount: body.amount,
      method: body.method,
      operatorId: attestingOperator.id,
      correction: body.correction,
    })
    return {
      id: attested.id,
      amount: attested.amount,
      method: attested.method,
      attestedAt: attested.attestedAt,
    }
  } catch (err) {
    if (err instanceof InvalidPinError) {
      throw createError({
        statusCode: 401,
        statusMessage: err.message,
        data: { code: err.constructor.name },
      })
    }
    if (err instanceof ReservationGroupNotFoundError) {
      throw createError({
        statusCode: 404,
        statusMessage: err.message,
        data: { code: err.constructor.name },
      })
    }
    translateHandoverPossessionError(err)
  } finally {
    await Promise.all([availability.close(), handover.close(), operators.close()])
  }
})
