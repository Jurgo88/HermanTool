import { z } from 'zod'
import { resolveScanEvent } from '../../contexts/handover-possession'
import { createHandoverPossessionDeps, translateHandoverPossessionError } from '../../utils/handover-possession-deps'
import { requireOperator } from '../../utils/operator-session'

const bodySchema = z.object({ tagCode: z.string().min(1) })

// P3, FR-17, FR-45, NFR-02: the primary counter interaction. A scan is
// recorded as an intent and resolved to HandoverOut, HandoverIn, or a
// plain lookup purely from the Asset's current state — this route never
// declares which. Operator-authenticated (a counter action, FR-34
// attribution), not Customer-facing. Kept import-light (R-08): no Stripe,
// Catalog, or Availability & Reservation — nothing this endpoint doesn't
// need, since "scan-to-resolution must feel instant" is the one latency
// requirement this product exists to protect.
export default defineEventHandler(async (event) => {
  const operator = await requireOperator(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const { repo, assetRegistryRepo, close } = createHandoverPossessionDeps(event)

  try {
    return await resolveScanEvent(repo, assetRegistryRepo, {
      tenantId: operator.tenantId,
      tagCode: body.tagCode,
      operatorId: operator.id,
    })
  } catch (err) {
    translateHandoverPossessionError(err)
  } finally {
    await close()
  }
})
