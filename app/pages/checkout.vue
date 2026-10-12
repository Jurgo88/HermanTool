<script setup lang="ts">
// S-03 Checkout (W1/W2, FR-06, FR-09, FR-21, D-07, D-14, D-26, D-35).
// One page, one button: the tools, the Customer's details and the payment
// with the terms. "Zaplatiť" then runs the three server steps in order —
// POST /api/reservations/checkout (ReservationGroup + Reservations +
// Customer, D-14), POST /api/reservations/:groupId/accept-terms (D-35),
// POST /api/payments/checkout-session — and leaves for Stripe's hosted
// page (NFR-05: this app never touches card data). W1's order holds: the
// terms are shown and accepted before payment begins.
//
// The ReservationGroup is created only on that click, so a Visitor who
// looks and leaves holds nothing. If a later step fails, the group is kept
// and a retry continues from the step that failed; changing the tools or
// the details starts a new one (the old Pending hold expires on its own,
// FR-08).
import { sk } from '~/i18n/sk'
import { formatCount, formatMoney, formatTime } from '~/utils/format'
import { orderForDisplay, toCheckoutLines, toQuoteLines } from '~/utils/reservation-draft'
import { getErrorCode } from '~/utils/error-code'

definePageMeta({ layout: 'public', hero: true })

// D-35: the version of the text on /podmienky, recorded with the
// acceptance. Still the owner's draft awaiting legal review (OQ #1), so
// the page keeps its draft marker and check:no-draft-copy keeps failing.
const TERMS_VERSION = sk.draft.terms.version

const { lines: draftLines, restored, pendingGroupId, finishCheckout, removeLine } = useReservationDraft()
const displayLines = computed(() => orderForDisplay(draftLines.value))

const customerName = ref('')
const customerEmail = ref('')
const customerPhone = ref('')
const termsAccepted = ref(false)

interface Money {
  amount: number
  currency: string
}

interface ReservationQuote {
  lines: { days: number; rentalFee: Money; deposit: Money; startsInPast?: boolean }[]
  rentalFeeTotal: Money
  depositTotal: Money
}

// #164: the fee and the deposit come from the server — the same
// computation Stripe's amount uses — so this page does no date arithmetic
// (D-51) and cannot show a different total from the one charged.
const quote = ref<ReservationQuote | null>(null)
const quoteStatus = ref<'idle' | 'loading' | 'loaded' | 'error'>('idle')

async function loadQuote() {
  if (draftLines.value.length === 0) {
    quote.value = null
    quoteStatus.value = 'idle'
    return
  }
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

// #190: a group this browser left unpaid. Still payable: offer to finish it
// (paying here instead would hold the same tools twice). Paid: the draft is
// done. Expired or unknown: forget it and keep the draft.
const unpaidHoldUntil = ref<string | null>(null)

async function checkPendingGroup() {
  const id = pendingGroupId.value
  if (id === null) return
  try {
    const status = await $fetch<{ state: 'payable' | 'paid' | 'expired'; holdUntil: string | null }>(
      `/api/reservations/${id}/payment-status`,
    )
    if (status.state === 'payable') unpaidHoldUntil.value = status.holdUntil
    else if (status.state === 'paid') finishCheckout()
    else pendingGroupId.value = null
  } catch {
    pendingGroupId.value = null
  }
}

watch(restored, (isRestored) => isRestored && checkPendingGroup(), { immediate: true })

const anyLineInPast = computed(() => quote.value?.lines.some((line) => line.startsInPast) ?? false)

// --- Validation: shown at the field, after the first attempt to pay ---

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const attempted = ref(false)

const fieldErrors = computed(() => {
  if (!attempted.value) return { name: null, email: null, phone: null, terms: null }
  const email = customerEmail.value.trim()
  return {
    name: customerName.value.trim() ? null : sk.checkout.nameRequired,
    email: !email ? sk.checkout.emailRequired : EMAIL_PATTERN.test(email) ? null : sk.checkout.emailInvalid,
    phone: customerPhone.value.trim() ? null : sk.checkout.phoneRequired,
    terms: termsAccepted.value ? null : sk.checkout.termsAcceptRequired,
  }
})

const nameInput = ref<HTMLInputElement | null>(null)
const emailInput = ref<HTMLInputElement | null>(null)
const phoneInput = ref<HTMLInputElement | null>(null)
const termsInput = ref<HTMLInputElement | null>(null)

function focusFirstInvalid(): boolean {
  const errors = fieldErrors.value
  const first = errors.name
    ? nameInput.value
    : errors.email
      ? emailInput.value
      : errors.phone
        ? phoneInput.value
        : errors.terms
          ? termsInput.value
          : null
  first?.focus()
  return first !== null
}

// --- Payment ---

const error = ref<string | null>(null)
const paying = ref(false)
const reservationGroupId = ref<number | null>(null)

watch([draftLines, customerName, customerEmail, customerPhone], () => {
  if (!paying.value) reservationGroupId.value = null
}, { deep: true })

const payLabel = computed(() =>
  quote.value
    ? sk.checkout.payAction.replace('{amount}', formatMoney(quote.value.rentalFeeTotal))
    : sk.checkout.payActionNoAmount,
)

// Customer register only (UI-D-08): a known code gets its own sentence,
// anything else a status-based fallback; server text is never shown.
function messageFor(err: unknown): string {
  const code = getErrorCode(err)
  const customerMessage = code ? (sk.errors.customer as Record<string, string>)[code] : undefined
  if (customerMessage) return customerMessage
  const statusCode = (err as { statusCode?: number })?.statusCode
  if (statusCode === 502) return sk.checkout.paymentProviderError
  if (statusCode === 409) return sk.checkout.conflictError
  return sk.common.somethingWentWrong
}

async function pay() {
  error.value = null
  attempted.value = true
  if (focusFirstInvalid()) return
  if (quoteStatus.value !== 'loaded') return
  if (anyLineInPast.value) {
    error.value = sk.checkout.linesInPastError
    return
  }

  paying.value = true
  try {
    if (reservationGroupId.value === null) {
      const result = await $fetch<{ reservationGroupId: number }>('/api/reservations/checkout', {
        method: 'POST',
        body: {
          lines: toCheckoutLines(draftLines.value),
          customer: {
            name: customerName.value.trim(),
            email: customerEmail.value.trim(),
            phone: customerPhone.value.trim(),
          },
        },
      })
      reservationGroupId.value = result.reservationGroupId
    }
    await $fetch(`/api/reservations/${reservationGroupId.value}/accept-terms`, {
      method: 'POST',
      body: { termsVersion: TERMS_VERSION },
    })
    const { redirectUrl } = await $fetch<{ redirectUrl: string }>('/api/payments/checkout-session', {
      method: 'POST',
      body: { reservationGroupId: reservationGroupId.value },
    })
    // #190: the draft stays until the payment succeeds (success page), so
    // leaving Stripe's page can be undone. The button stays pending until
    // the browser leaves.
    pendingGroupId.value = reservationGroupId.value
    window.location.href = redirectUrl
  } catch (err: unknown) {
    error.value = messageFor(err)
    paying.value = false
    if (getErrorCode(err) === 'AssetTypeUnavailableError') await loadQuote()
  }
}
</script>

<template>
  <main class="checkout-page">
    <PublicHero narrow>
      <h1>{{ sk.checkout.title }}</h1>
      <p>{{ sk.checkout.lead }}</p>
    </PublicHero>

    <div class="checkout">

    <p v-if="!restored" class="checkout__empty" aria-busy="true">{{ sk.checkout.restoring }}</p>

    <div v-else-if="draftLines.length === 0" class="checkout__empty">
      <p>{{ sk.checkout.emptyDraft }}</p>
      <NuxtLink to="/" class="checkout__empty-link">
        <AppButton variant="primary">{{ sk.checkout.backToCatalogAction }}</AppButton>
      </NuxtLink>
    </div>

    <form v-else class="checkout__form" novalidate @submit.prevent="pay">
      <div v-if="unpaidHoldUntil && pendingGroupId" class="checkout__pending" role="status">
        <p>{{ sk.checkout.pendingNotice.replace('{time}', formatTime(unpaidHoldUntil)) }}</p>
        <NuxtLink :to="`/reservations/${pendingGroupId}/cancel`">
          <AppButton variant="primary">{{ sk.checkout.pendingResumeAction }}</AppButton>
        </NuxtLink>
      </div>

      <section class="checkout__section" aria-labelledby="checkout-tools">
        <h2 id="checkout-tools" class="checkout__heading">
          <span class="checkout__step" aria-hidden="true">1</span>{{ sk.checkout.toolsHeading }}
        </h2>
        <ul class="checkout__lines">
          <li
            v-for="{ line, index, isAccessory } in displayLines"
            :key="`${line.assetTypeId}-${line.period.startDay}-${line.period.endDay}`"
            class="checkout__line"
            :class="{ 'checkout__line--accessory': isAccessory }"
          >
            <div class="checkout__line-text">
              <span class="checkout__line-name">
                {{ line.assetTypeName }}
                <span v-if="isAccessory" class="checkout__line-kind">{{ sk.checkout.accessoryLabel }}</span>
              </span>
              <span class="checkout__line-meta">
                <DayRange :start-day="line.period.startDay" :end-day="line.period.endDay" />
                <template v-if="quote?.lines[index]">
                  · {{ formatCount(quote.lines[index].days, sk.checkout.dayCount) }}
                </template>
                · {{ sk.checkout.unitCount.replace('{count}', String(line.quantity)) }}
              </span>
              <span v-if="quote?.lines[index]?.startsInPast" class="checkout__line-warn" role="status">
                {{ sk.checkout.lineInPast }}
              </span>
            </div>
            <div class="checkout__line-side">
              <MoneyAmount v-if="quote?.lines[index]" :amount="quote.lines[index].rentalFee" />
              <button
                type="button"
                class="checkout__remove"
                :aria-label="sk.checkout.removeLineLabel.replace('{name}', line.assetTypeName)"
                :disabled="paying"
                @click="removeLine(index)"
              >
                {{ sk.checkout.removeLineAction }}
              </button>
            </div>
          </li>
        </ul>
        <p v-if="quoteStatus === 'loading' && !quote" aria-busy="true">{{ sk.checkout.quoteLoading }}</p>
        <AppAlert v-else-if="quoteStatus === 'error'" :message="sk.checkout.quoteError" />
        <NuxtLink to="/" class="checkout__add">{{ sk.checkout.addMoreAction }}</NuxtLink>
      </section>

      <section class="checkout__section" aria-labelledby="checkout-details">
        <h2 id="checkout-details" class="checkout__heading">
          <span class="checkout__step" aria-hidden="true">2</span>{{ sk.checkout.customerDetailsHeading }}
        </h2>
        <AppField :label="sk.checkout.nameLabel" :error="fieldErrors.name">
          <template #default="slotProps">
            <input
              :id="slotProps.id"
              ref="nameInput"
              v-model="customerName"
              type="text"
              autocomplete="name"
              autocapitalize="words"
              enterkeyhint="next"
              :aria-invalid="fieldErrors.name ? 'true' : undefined"
              :aria-describedby="slotProps.ariaDescribedby"
              :disabled="paying"
            />
          </template>
        </AppField>
        <AppField :label="sk.checkout.emailLabel" :hint="sk.checkout.emailHint" :error="fieldErrors.email">
          <template #default="slotProps">
            <input
              :id="slotProps.id"
              ref="emailInput"
              v-model="customerEmail"
              type="email"
              inputmode="email"
              autocomplete="email"
              autocapitalize="off"
              spellcheck="false"
              enterkeyhint="next"
              :aria-invalid="fieldErrors.email ? 'true' : undefined"
              :aria-describedby="slotProps.ariaDescribedby"
              :disabled="paying"
            />
          </template>
        </AppField>
        <AppField :label="sk.checkout.phoneLabel" :hint="sk.checkout.phoneHint" :error="fieldErrors.phone">
          <template #default="slotProps">
            <input
              :id="slotProps.id"
              ref="phoneInput"
              v-model="customerPhone"
              type="tel"
              inputmode="tel"
              autocomplete="tel"
              enterkeyhint="done"
              :aria-invalid="fieldErrors.phone ? 'true' : undefined"
              :aria-describedby="slotProps.ariaDescribedby"
              :disabled="paying"
            />
          </template>
        </AppField>
      </section>

      <section class="checkout__section" aria-labelledby="checkout-payment">
        <h2 id="checkout-payment" class="checkout__heading">
          <span class="checkout__step" aria-hidden="true">3</span>{{ sk.checkout.paymentHeading }}
        </h2>

        <!-- D-07/FR-21: two separate sums. The card pays the rental only; the
          deposit is cash at the counter and is as prominent as the card sum. -->
        <dl v-if="quote" class="checkout__amounts">
          <div class="checkout__amount">
            <dt>{{ sk.checkout.payNowLabel }}</dt>
            <dd><MoneyAmount :amount="quote.rentalFeeTotal" size="large" /></dd>
          </div>
          <div class="checkout__amount checkout__amount--cash">
            <dt>
              {{ sk.checkout.depositLabel }}
              <span class="checkout__amount-sub">{{ sk.checkout.depositSubLabel }}</span>
            </dt>
            <dd><MoneyAmount :amount="quote.depositTotal" size="large" /></dd>
          </div>
        </dl>

        <DraftNotice>
          <p>{{ sk.draft.checkoutTermsNotice }}</p>
          <label class="checkout__terms">
            <input
              ref="termsInput"
              v-model="termsAccepted"
              type="checkbox"
              :aria-invalid="fieldErrors.terms ? 'true' : undefined"
              :aria-describedby="fieldErrors.terms ? 'checkout-terms-error' : undefined"
              :disabled="paying"
            />
            <span>{{ sk.draft.checkoutTermsAcceptLabel }}</span>
          </label>
          <p v-if="fieldErrors.terms" id="checkout-terms-error" class="checkout__field-error" role="alert">
            {{ fieldErrors.terms }}
          </p>
        </DraftNotice>
        <p>
          <NuxtLink to="/podmienky" target="_blank">{{ sk.checkout.termsPageLinkAction }}</NuxtLink>
        </p>
      </section>

      <!-- On a phone this bar stays at the bottom of the screen, so the sum and
        the button are always in reach, and an error appears next to them. -->
      <div class="checkout__action">
        <AppAlert :message="error" />
        <AppButton
          type="submit"
          class="checkout__pay"
          variant="primary"
          size="counter"
          :pending="paying"
          :disabled="quoteStatus !== 'loaded'"
        >
          {{ paying ? sk.checkout.startingPayment : payLabel }}
        </AppButton>
        <p class="checkout__note">{{ sk.checkout.paymentNote }}</p>
      </div>
    </form>
    </div>
  </main>
</template>

<style scoped>
.checkout-page {
  width: 100%;
}

/* Rises into the hero band. */
.checkout {
  position: relative;
  box-sizing: border-box;
  max-width: 680px;
  margin: calc(var(--ht-hero-overlap) * -1) auto 0;
  padding: 0 var(--ht-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-4);
}

.checkout__form input[aria-invalid='true'] {
  border-color: var(--ht-danger);
}

.checkout__pending {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ht-space-3);
  padding: var(--ht-space-4);
  background: var(--ht-surface);
  border: 2px solid var(--ht-brand-light);
  border-radius: calc(var(--ht-radius-card) + var(--ht-space-1));
  box-shadow: var(--ht-shadow-card);
}

.checkout__pending p {
  margin: 0;
  font-weight: 600;
}

.checkout__empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ht-space-3);
  margin: 0;
  padding: var(--ht-space-5);
  background: var(--ht-surface);
  border-radius: calc(var(--ht-radius-card) + var(--ht-space-1));
  box-shadow: var(--ht-shadow-card);
}

.checkout__empty p {
  margin: 0;
}

.checkout__form {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-4);
}

/* Each part is its own card. */
.checkout__section {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-3);
  padding: var(--ht-space-5) var(--ht-space-4);
  background: var(--ht-surface);
  border-radius: calc(var(--ht-radius-card) + var(--ht-space-1));
  box-shadow: var(--ht-shadow-card);
}

.checkout__heading {
  display: flex;
  align-items: center;
  gap: var(--ht-space-2);
  margin: 0;
}

.checkout__step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: var(--ht-space-6);
  height: var(--ht-space-6);
  border-radius: 50%;
  background: var(--ht-button-primary-bg);
  color: var(--ht-on-brand);
  font-weight: 700;
  font-size: var(--ht-text-2);
}

.checkout__lines {
  list-style: none;
  margin: 0;
  padding: 0;
  border-radius: var(--ht-radius-card);
  background: var(--ht-paper);
}

.checkout__line {
  display: flex;
  justify-content: space-between;
  gap: var(--ht-space-3);
  padding: var(--ht-space-3) var(--ht-space-4);
}

.checkout__line + .checkout__line {
  border-top: 1px solid var(--ht-line);
}

.checkout__line--accessory {
  padding-left: var(--ht-space-6);
  border-top-style: dashed;
}

.checkout__line-text {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-1);
  min-width: 0;
}

.checkout__line-name {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.checkout__line-kind {
  margin-left: var(--ht-space-1);
  font-weight: 400;
  font-size: var(--ht-text-1);
  color: var(--ht-ink-muted);
}

.checkout__line-meta {
  font-size: var(--ht-text-2);
  color: var(--ht-ink-muted);
}

.checkout__line-warn {
  font-size: var(--ht-text-2);
  color: var(--ht-danger);
}

.checkout__line-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--ht-space-1);
  flex: none;
}

.checkout__remove {
  min-height: var(--ht-hit-min);
  padding: 0 var(--ht-space-1);
  margin-right: calc(var(--ht-space-1) * -1);
  background: none;
  border: 0;
  color: var(--ht-ink-muted);
  font-size: var(--ht-text-2);
  text-decoration: underline;
  text-underline-offset: 0.2em;
  cursor: pointer;
}

.checkout__remove:hover {
  color: var(--ht-danger);
}

.checkout__add {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  min-height: var(--ht-hit-min);
  font-weight: 600;
}

.checkout__amounts {
  display: flex;
  flex-direction: column;
  margin: 0;
  background: var(--ht-brand-tint);
  border-radius: var(--ht-radius-card);
}

.checkout__amount {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ht-space-3);
  padding: var(--ht-space-3) var(--ht-space-4);
}

.checkout__amount dt {
  display: flex;
  flex-direction: column;
  font-weight: 600;
}

.checkout__amount dd {
  margin: 0;
  flex: none;
}

.checkout__amount--cash {
  border-top: 1px solid var(--ht-surface);
  background: var(--ht-paper);
  border-radius: 0 0 var(--ht-radius-card) var(--ht-radius-card);
}

.checkout__amount-sub {
  font-weight: 400;
  font-size: var(--ht-text-1);
  color: var(--ht-ink-muted);
}

.checkout__terms {
  display: flex;
  align-items: flex-start;
  gap: var(--ht-space-2);
  min-height: var(--ht-hit-min);
  padding-top: var(--ht-space-2);
  font-weight: 600;
  cursor: pointer;
}

.checkout__terms input {
  flex: none;
  width: var(--ht-space-5);
  height: var(--ht-space-5);
  margin: 0;
}

.checkout__field-error {
  margin: 0;
  font-size: var(--ht-text-1);
  color: var(--ht-danger);
}

/* A card floating at the bottom of a phone screen. */
.checkout__action {
  position: sticky;
  bottom: calc(var(--ht-space-3) + var(--ht-safe-bottom));
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-2);
  margin-bottom: var(--ht-space-5);
  padding: var(--ht-space-3) var(--ht-space-4);
  background: var(--ht-surface);
  border-radius: calc(var(--ht-radius-card) + var(--ht-space-1));
  box-shadow: var(--ht-shadow-raised);
}

.checkout__pay {
  width: 100%;
}

.checkout__note {
  margin: 0;
  text-align: center;
  font-size: var(--ht-text-1);
  color: var(--ht-ink-muted);
}

@media (min-width: 900px) {
  .checkout__action {
    position: static;
    margin-bottom: var(--ht-space-7);
    box-shadow: var(--ht-shadow-card);
  }
}
</style>
