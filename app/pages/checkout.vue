<script setup lang="ts">
// W1/W2, FR-06, FR-09, D-14, D-26, D-35; issue #93 follow-up (IR-12
// Checkout), S-03. Takes the draft reservation lines assembled on
// ./index.vue and drives them through the three server routes that
// already existed with no UI in front of them: POST
// /api/reservations/checkout (creates the ReservationGroup +
// Reservations + Customer, D-14's "Visitor becomes a Customer"), POST
// /api/reservations/:groupId/accept-terms (D-35 — mechanics only, see
// the placeholder note below), then POST /api/payments/checkout-session,
// which redirects to Stripe's hosted page (NFR-05: this app never
// touches card data).
//
// Two stages on one page, matching W1's own sequencing ("Before payment
// begins, the Customer is shown rental terms... then accepts them"):
// stage 1 collects customer details and creates the ReservationGroup;
// stage 2 (shown only once that succeeds) is terms + pay.
import { sk } from '~/i18n/sk'
import { toCheckoutLines, toQuoteLines } from '~/utils/reservation-draft'

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

const { lines: draftLines, clearLines, removeLine } = useReservationDraft()

const customerName = ref('')
const customerEmail = ref('')
const customerPhone = ref('')
const termsAccepted = ref(false)

const error = ref<string | null>(null)
const creatingReservation = ref(false)
const startingPayment = ref(false)
const reservationGroupId = ref<number | null>(null)

interface Money {
  amount: number
  currency: string
}

interface ReservationQuote {
  lines: { rentalFee: Money; deposit: Money }[]
  rentalFeeTotal: Money
  depositTotal: Money
}

// #164: the rental fee (rate × days × units) and the deposit come from
// the server — the same computation Stripe's amount uses — so this page
// does no date arithmetic (D-51) and cannot show a different total from
// the one charged.
const quote = ref<ReservationQuote | null>(null)
const quoteStatus = ref<'idle' | 'loading' | 'loaded' | 'error'>('idle')

async function loadQuote() {
  if (draftLines.value.length === 0) return
  quoteStatus.value = 'loading'
  try {
    quote.value = await $fetch<ReservationQuote>('/api/public/reservation-quote', {
      method: 'POST',
      body: { lines: toQuoteLines(draftLines.value) },
    })
    quoteStatus.value = 'loaded'
  } catch {
    quote.value = null
    quoteStatus.value = 'error'
  }
}

watch(draftLines, loadQuote, { immediate: true, deep: true })

// D-07/FR-21: restated at stage 2 (S-03) — the platform moves no deposit
// money, so the Customer must see, right before paying by card, that
// this total is separate cash handed over at the counter. Captured here
// because clearLines() below empties the draft the moment stage 1
// succeeds.
const committedQuote = ref<ReservationQuote | null>(null)

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
      lines: toCheckoutLines(draftLines.value),
      customer: { name: customerName.value, email: customerEmail.value, phone: customerPhone.value },
    }
    const result = await $fetch<{ reservationGroupId: number }>('/api/reservations/checkout', {
      method: 'POST',
      body,
    })
    committedQuote.value = quote.value
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
  <main class="checkout">
    <h1>{{ sk.checkout.title }}</h1>
    <AppAlert :message="error" />

    <p v-if="draftLines.length === 0 && !reservationGroupId">
      {{ sk.checkout.emptyDraft }}
      <NuxtLink to="/">{{ sk.checkout.backToCatalogAction }}</NuxtLink>
    </p>

    <template v-else-if="!reservationGroupId">
      <section class="checkout__section">
        <h2>{{ sk.checkout.summaryHeading }}</h2>
        <ul class="checkout__summary-list">
          <li v-for="(line, index) in draftLines" :key="`${line.assetTypeId}-${line.period.startDay}-${line.period.endDay}`">
            <span>{{ line.assetTypeName }} × {{ line.quantity }}</span>
            <DayRange :start-day="line.period.startDay" :end-day="line.period.endDay" />
            <MoneyAmount v-if="quote?.lines[index]" :amount="quote.lines[index].rentalFee" />
            <AppButton variant="quiet" @click="removeLine(index)">{{ sk.checkout.removeLineAction }}</AppButton>
          </li>
        </ul>
        <p v-if="quoteStatus === 'loading'" aria-busy="true">{{ sk.checkout.quoteLoading }}</p>
        <AppAlert v-else-if="quoteStatus === 'error'" :message="sk.checkout.quoteError" />
        <template v-else-if="quote">
          <p class="checkout__total">
            {{ sk.checkout.totalLabel }}: <MoneyAmount :amount="quote.rentalFeeTotal" size="large" />
          </p>
          <p>{{ sk.checkout.depositRestatedLabel }}: <MoneyAmount :amount="quote.depositTotal" /></p>
        </template>
      </section>

      <section class="checkout__section">
        <h2>{{ sk.checkout.customerDetailsHeading }}</h2>
        <AppField :label="sk.checkout.nameLabel">
          <template #default="slotProps">
            <input :id="slotProps.id" v-model="customerName" type="text" autocomplete="name" />
          </template>
        </AppField>
        <AppField :label="sk.checkout.emailLabel">
          <template #default="slotProps">
            <input :id="slotProps.id" v-model="customerEmail" type="email" autocomplete="email" />
          </template>
        </AppField>
        <AppField :label="sk.checkout.phoneLabel">
          <template #default="slotProps">
            <input :id="slotProps.id" v-model="customerPhone" type="tel" autocomplete="tel" />
          </template>
        </AppField>
        <AppButton
          variant="primary"
          :pending="creatingReservation"
          :disabled="quoteStatus !== 'loaded'"
          @click="createReservation"
        >
          {{ creatingReservation ? sk.checkout.creatingReservation : sk.checkout.createReservationAction }}
        </AppButton>
      </section>
    </template>

    <section v-else class="checkout__section">
      <h2>{{ sk.checkout.termsHeading }}</h2>
      <DraftNotice>
        <p>{{ sk.draft.checkoutTermsNotice }}</p>
        <label>
          <input v-model="termsAccepted" type="checkbox" />
          {{ sk.draft.checkoutTermsAcceptLabel }}
        </label>
      </DraftNotice>
      <p><NuxtLink to="/podmienky" target="_blank">{{ sk.checkout.termsPageLinkAction }}</NuxtLink></p>

      <template v-if="committedQuote">
        <p>{{ sk.checkout.rentalFeeRestatedLabel }}: <MoneyAmount :amount="committedQuote.rentalFeeTotal" /></p>
        <p class="checkout__deposit-note">
          {{ sk.checkout.depositRestatedLabel }}: <MoneyAmount :amount="committedQuote.depositTotal" size="large" />
        </p>
      </template>
      <p class="checkout__deposit-hint">{{ sk.checkout.depositRestatedNote }}</p>

      <AppButton variant="primary" size="counter" :pending="startingPayment" :disabled="!termsAccepted" @click="acceptTermsAndPay">
        {{ startingPayment ? sk.checkout.startingPayment : sk.checkout.payAction }}
      </AppButton>
    </section>
  </main>
</template>

<style scoped>
.checkout {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--ht-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-5);
}

.checkout__section {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-3);
}

.checkout__summary-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-2);
}

.checkout__summary-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ht-space-3);
  padding: var(--ht-space-2) 0;
  border-bottom: 1px solid var(--ht-line);
}

.checkout__total {
  display: flex;
  align-items: baseline;
  gap: var(--ht-space-2);
}

.checkout__deposit-note {
  display: flex;
  align-items: baseline;
  gap: var(--ht-space-2);
  margin-top: var(--ht-space-3);
}

.checkout__deposit-hint {
  color: var(--ht-ink-muted);
  font-size: var(--ht-text-2);
}
</style>
