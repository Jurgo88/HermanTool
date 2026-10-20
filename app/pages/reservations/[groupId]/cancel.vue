<script setup lang="ts">
// W2, S-05, #190. Stripe's cancelUrl: the Customer left the hosted payment
// page without paying. Asks the server what this browser may do next
// (server/utils/checkout-payment-status.ts):
//   - payable: the Pending hold still stands, so "Zaplatiť znova" opens a new
//     checkout for the SAME group (the earlier one is closed first, see
//     startPayment) and keeps the days already held;
//   - expired: the hold lapsed (FR-08 sweep); the draft was kept, so trying
//     again starts from it;
//   - paid: nothing to do.
// No hold is released here (FR-08 owns that) and the copy never implies it.
// Not the cancellation surface — W11 is blocked on OQ #1.
import { sk } from '~/i18n/sk'
import { formatTime } from '~/utils/format'
import { getErrorCode } from '~/utils/error-code'

definePageMeta({ layout: 'public', hero: true })

const route = useRoute()
const reservationGroupId = Number(route.params.groupId)
const { lines, restored, pendingGroupId, finishCheckout } = useReservationDraft()

type Status = { state: 'payable' | 'paid' | 'expired'; holdUntil: string | null }
const status = ref<Status | null>(null)
const loadState = ref<'loading' | 'loaded' | 'unknown'>('loading')

async function loadStatus() {
  try {
    status.value = await $fetch<Status>(`/api/reservations/${reservationGroupId}/payment-status`)
    loadState.value = 'loaded'
  } catch {
    loadState.value = 'unknown'
  }
}

onMounted(loadStatus)

watch(
  [restored, status],
  ([isRestored, current]) => {
    if (!isRestored || !current) return
    if (current.state === 'paid') finishCheckout()
    else if (current.state === 'expired') pendingGroupId.value = null
  },
  { immediate: true },
)

const error = ref<string | null>(null)
const startingPayment = ref(false)

async function payAgain() {
  error.value = null
  startingPayment.value = true
  try {
    const { redirectUrl } = await $fetch<{ redirectUrl: string }>('/api/payments/checkout-session', {
      method: 'POST',
      body: { reservationGroupId },
    })
    window.location.href = redirectUrl
  } catch (err: unknown) {
    const code = getErrorCode(err)
    const message = code ? (sk.errors.customer as Record<string, string>)[code] : undefined
    const statusCode = (err as { statusCode?: number })?.statusCode
    error.value = message ?? (statusCode === 502 ? sk.checkout.paymentProviderError : sk.common.somethingWentWrong)
    startingPayment.value = false
    await loadStatus()
  }
}

const hasDraft = computed(() => lines.value.length > 0)

// The band says what happened; the card below holds what to do next.
const heading = computed(() => {
  if (loadState.value === 'loading') return sk.checkoutResult.unknownTitle
  if (status.value?.state === 'payable') return sk.checkoutResult.payableTitle
  if (status.value?.state === 'paid') return sk.checkoutResult.paidTitle
  if (status.value?.state === 'expired') return sk.checkoutResult.expiredTitle
  return sk.checkoutResult.unknownTitle
})

const lead = computed(() => {
  if (loadState.value === 'loading') return null
  if (status.value?.state === 'payable') {
    return status.value.holdUntil
      ? sk.checkoutResult.payableBody.replace('{time}', formatTime(status.value.holdUntil))
      : null
  }
  if (status.value?.state === 'paid') return sk.checkoutResult.paidBody
  if (status.value?.state === 'expired') return sk.checkoutResult.expiredBody
  return sk.checkoutResult.unknownBody
})
</script>

<template>
  <main class="result-page">
    <PublicHero>
      <div class="result__hero">
        <h1>{{ heading }}</h1>
        <p v-if="lead">{{ lead }}</p>
      </div>
    </PublicHero>

    <div class="result">
      <section class="result__card">
        <p v-if="loadState === 'loading'" aria-busy="true">{{ sk.checkoutResult.statusLoading }}</p>

        <template v-else-if="status?.state === 'payable'">
          <DraftSummaryList v-if="hasDraft" class="result__wide" :lines="lines" />
          <AppAlert :message="error" />
          <AppButton
            class="result__wide"
            variant="primary"
            size="counter"
            :pending="startingPayment"
            @click="payAgain"
          >
            {{
              startingPayment ? sk.checkoutResult.startingPayment : sk.checkoutResult.payAgainAction
            }}
          </AppButton>
          <template v-if="hasDraft">
            <NuxtLink to="/checkout" class="result__wide">
              <AppButton class="result__wide" variant="secondary" :disabled="startingPayment">
                {{ sk.checkoutResult.editAction }}
              </AppButton>
            </NuxtLink>
            <p class="result__note">{{ sk.checkoutResult.editNote }}</p>
          </template>
        </template>

        <NuxtLink v-else-if="status?.state === 'paid'" to="/" class="result__wide">
          <AppButton class="result__wide" variant="primary">
            {{ sk.checkoutResult.backToCatalogAction }}
          </AppButton>
        </NuxtLink>

        <NuxtLink v-else :to="hasDraft ? '/checkout' : '/'" class="result__wide">
          <AppButton class="result__wide" variant="primary">
            {{ hasDraft ? sk.checkoutResult.retryAction : sk.checkoutResult.backToCatalogAction }}
          </AppButton>
        </NuxtLink>
      </section>
    </div>
  </main>
</template>

<style scoped>
.result-page {
  width: 100%;
}

.result__hero {
  max-width: 520px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-3);
  text-align: center;
}

.result {
  position: relative;
  box-sizing: border-box;
  max-width: 520px;
  margin: calc(var(--ht-hero-overlap) * -1) auto 0;
  padding: 0 var(--ht-space-4) var(--ht-space-7);
}

.result__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ht-space-3);
  padding: var(--ht-space-5) var(--ht-space-4);
  background: var(--ht-surface);
  border-radius: var(--ht-radius-card);
  box-shadow: var(--ht-shadow-card);
  text-align: center;
}

.result__card p {
  margin: 0;
}

.result__wide {
  width: 100%;
}

.result__note {
  font-size: var(--ht-text-1);
  color: var(--ht-ink-muted);
}
</style>
