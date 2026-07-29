// Zod schemas for Availability & Reservation's HTTP boundary (W1, W2;
// FR-06, FR-09, D-35). Validation happens here, not in Vue components
// (D-25) — imported only by server/api/reservations/* route handlers.
import { z } from 'zod'

const rentalPeriodSchema = z.object({
  startDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

// D-14, W1: "the Visitor becomes a Customer" at checkout commitment —
// name/email/phone are collected here because this is the earliest (and,
// per D-23, the only guaranteed) point the platform ever has an address
// to send the confirmation/self-service link to. Deeper validation (a
// real email shape check, non-empty name/phone) is
// server/contexts/customer-identity-compliance/customer.ts's job — this
// only rejects malformed request shapes.
const customerDetailsSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string(),
})

// FR-06: a checkout covering n AssetTypes produces one ReservationGroup
// and n Reservations. Deeper validation (real calendar dates, endDay not
// before startDay, capacity) is the domain layer's job (D-25) — this only
// rejects malformed request shapes.
export const checkoutReservationGroupBodySchema = z.object({
  lines: z
    .array(
      z.object({
        assetTypeId: z.number().int().positive(),
        period: rentalPeriodSchema,
      }),
    )
    .min(1),
  customer: customerDetailsSchema,
})

// D-35: termsVersion is an opaque, non-empty identifier — see
// server/contexts/availability-reservation/reservation.ts for why its
// content is never validated here.
export const acceptTermsBodySchema = z.object({
  termsVersion: z.string().min(1),
})
