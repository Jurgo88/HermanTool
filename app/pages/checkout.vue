<script setup lang="ts">
// W1/W2, FR-06, FR-09, D-14, D-26, D-35; issue #93 follow-up (IR-12
// Checkout). Takes the draft reservation lines assembled on ./index.vue
// and drives them through the three server routes that already existed
// with no UI in front of them: POST /api/reservations/checkout (creates
// the ReservationGroup + Reservations + Customer, D-14's "Visitor becomes
// a Customer"), POST /api/reservations/:groupId/accept-terms (D-35 —
// mechanics only, see the placeholder note below), then POST
// /api/payments/checkout-session, which redirects to Stripe's hosted
// page (NFR-05: this app never touches card data).
//
// Two stages on one page, matching W1's own sequencing ("Before payment
// begins, the Customer is shown rental terms... then accepts them"):
// stage 1 collects customer details and creates the ReservationGroup;
// stage 2 (shown only once that succeeds) is terms + pay.
import { sk } from '~/i18n/sk'

definePageMeta({ layout: 'public' })

// D-35, F1 KNOWN GAP: the mechanics of terms acceptance are built and
// tested (server/contexts/availability-reservation/reservation.ts), but
// no lawyer has reviewed the actual terms content or the pre-contractual
// information catalogue yet (CLAUDE.md OQ #1). This version string and
// the placeholder copy below are NOT real terms — they exist only so the
// rest of the checkout flow (which already depends on terms having been
// accepted, per FR-09) can be exercised end-to-end. Replace both before
// a real Customer ever sees this page.
const DRAFT_TERMS_VERSION = 'pilot-draft-v1'

const { lines: draftLines, clearLines } = useReservationDraft()

const customerName = ref('')
const customerEmail = ref('')
const customerPhone = ref('')
const termsAccepted = ref(false)

const error = ref<string | null>(null)
const creatingReservation = ref(false)
const startingPayment = ref(false)
const reservationGroupId = ref<number | null>(null)

function toEuros(minorUnits: number): string {
  return (minorUnits / 100).toFixed(2)
}

const currency = computed(() => draftLines.value[0]?.dayRate.currency ?? 'EUR')
const totalAmount = computed(() =>
  draftLines.value.reduce((sum, line) => sum + line.dayRate.amount * line.quantity, 0),
)

// Deliberately not `err.data.statusMessage` here (unlike the admin
// pages) — this is a public, Customer-facing page, and the domain layer's
// own error messages are English technical text meant for an Operator or
// a log line, not a Slovak customer (e.g. PaymentProviderUnavailableError,
// which currently fires on every "Zaplatiť" click in this dev
// environment because NUXT_STRIPE_SECRET_KEY is unset).
async function handleFetchError(err: unknown) {
  const statusCode = (err as { statusCode?: number })?.statusCode
  if (statusCode === 502) {
    error.value = sk.checkout.paymentProviderError
  } else if (statusCode === 409) {
    error.value = sk.checkout.conflictError
  } else {
    error.value = sk.common.somethingWentWrong
  }
}

async function createReservation() {
  error.value = null
  if (draftLines.value.length === 0) return
  if (!customerName.value.trim() || !customerEmail.value.trim() || !customerPhone.value.trim()) {
    error.value = sk.checkout.missingCustomerDetailsError
    return
  }

  creatingReservation.value = true
  try {
    const body = {
      lines: draftLines.value.map((line) => ({ assetTypeId: line.assetTypeId, period: line.period })),
      customer: { name: customerName.value, email: customerEmail.value, phone: customerPhone.value },
    }
    const result = await $fetch<{ reservationGroupId: number }>('/api/reservations/checkout', {
      method: 'POST',
      body,
    })
    reservationGroupId.value = result.reservationGroupId
    clearLines()
  } catch (err: unknown) {
    await handleFetchError(err)
  } finally {
    creatingReservation.value = false
  }
}

async function acceptTermsAndPay() {
  error.value = null
  if (!reservationGroupId.value || !termsAccepted.value) return

  startingPayment.value = true
  try {
    await $fetch(`/api/reservations/${reservationGroupId.value}/accept-terms`, {
      method: 'POST',
      body: { termsVersion: DRAFT_TERMS_VERSION },
    })
    const { redirectUrl } = await $fetch<{ redirectUrl: string }>('/api/payments/checkout-session', {
      method: 'POST',
      body: { reservationGroupId: reservationGroupId.value },
    })
    window.location.href = redirectUrl
  } catch (err: unknown) {
    await handleFetchError(err)
    startingPayment.value = false
  }
}
</script>

<template>
  <main>
    <h1>{{ sk.checkout.title }}</h1>
    <p v-if="error" role="alert">{{ error }}</p>

    <p v-if="draftLines.length === 0 && !reservationGroupId">
      {{ sk.checkout.emptyDraft }}
      <NuxtLink to="/">{{ sk.checkout.backToCatalogAction }}</NuxtLink>
    </p>

    <template v-else-if="!reservationGroupId">
      <section>
        <h2>{{ sk.checkout.summaryHeading }}</h2>
        <ul>
          <li v-for="line in draftLines" :key="`${line.assetTypeId}-${line.period.startDay}-${line.period.endDay}`">
            {{ line.assetTypeName }} × {{ line.quantity }} ({{ line.period.startDay }} – {{ line.period.endDay }})
          </li>
        </ul>
        <p>{{ sk.checkout.totalLabel }}: {{ toEuros(totalAmount) }} {{ currency }}</p>
      </section>

      <section>
        <h2>{{ sk.checkout.customerDetailsHeading }}</h2>
        <label>
          {{ sk.checkout.nameLabel }}
          <input v-model="customerName" type="text" autocomplete="name" />
        </label>
        <label>
          {{ sk.checkout.emailLabel }}
          <input v-model="customerEmail" type="email" autocomplete="email" />
        </label>
        <label>
          {{ sk.checkout.phoneLabel }}
          <input v-model="customerPhone" type="tel" autocomplete="tel" />
        </label>
        <p>
          <button type="button" :disabled="creatingReservation" @click="createReservation">
            {{ creatingReservation ? sk.checkout.creatingReservation : sk.checkout.createReservationAction }}
          </button>
        </p>
      </section>
    </template>

    <section v-else>
      <h2>{{ sk.checkout.termsHeading }}</h2>
      <p>{{ sk.checkout.termsDraftNotice }}</p>
      <label>
        <input v-model="termsAccepted" type="checkbox" />
        {{ sk.checkout.termsAcceptLabel }}
      </label>
      <p>
        <button type="button" :disabled="!termsAccepted || startingPayment" @click="acceptTermsAndPay">
          {{ startingPayment ? sk.checkout.startingPayment : sk.checkout.payAction }}
        </button>
      </p>
    </section>
  </main>
</template>
