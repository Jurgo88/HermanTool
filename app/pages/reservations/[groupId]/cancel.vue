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

definePageMeta({ layout: 'public' })

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
</script>

<template>
  <main class="result">
    <p v-if="loadState === 'loading'" aria-busy="true">{{ sk.checkoutResult.statusLoading }}</p>

    <template v-else-if="status?.state === 'payable'">
      <h1>{{ sk.checkoutResult.payableTitle }}</h1>
      <p v-if="status.holdUntil">
        {{ sk.checkoutResult.payableBody.replace('{time}', formatTime(status.holdUntil)) }}
      </p>
      <AppAlert :message="error" />
      <AppButton variant="primary" size="counter" :pending="startingPayment" @click="payAgain">
        {{ startingPayment ? sk.checkoutResult.startingPayment : sk.checkoutResult.payAgainAction }}
      </AppButton>
      <div v-if="hasDraft" class="result__secondary">
        <NuxtLink to="/checkout">
          <AppButton variant="secondary" :disabled="startingPayment">{{ sk.checkoutResult.editAction }}</AppButton>
        </NuxtLink>
        <p class="result__note">{{ sk.checkoutResult.editNote }}</p>
      </div>
    </template>

    <template v-else-if="status?.state === 'paid'">
      <h1>{{ sk.checkoutResult.paidTitle }}</h1>
      <p>{{ sk.checkoutResult.paidBody }}</p>
      <NuxtLink to="/"><AppButton variant="primary">{{ sk.checkoutResult.backToCatalogAction }}</AppButton></NuxtLink>
    </template>

    <template v-else-if="status?.state === 'expired'">
      <h1>{{ sk.checkoutResult.expiredTitle }}</h1>
      <p>{{ sk.checkoutResult.expiredBody }}</p>
      <NuxtLink :to="hasDraft ? '/checkout' : '/'">
        <AppButton variant="primary">
          {{ hasDraft ? sk.checkoutResult.retryAction : sk.checkoutResult.backToCatalogAction }}
        </AppButton>
      </NuxtLink>
    </template>

    <template v-else>
      <h1>{{ sk.checkoutResult.unknownTitle }}</h1>
      <p>{{ sk.checkoutResult.unknownBody }}</p>
      <NuxtLink :to="hasDraft ? '/checkout' : '/'">
        <AppButton variant="primary">
          {{ hasDraft ? sk.checkoutResult.retryAction : sk.checkoutResult.backToCatalogAction }}
        </AppButton>
      </NuxtLink>
    </template>
  </main>
</template>

<style scoped>
.result {
  max-width: 480px;
  margin: var(--ht-space-7) auto;
  padding: var(--ht-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-4);
  text-align: center;
}

.result h1,
.result p {
  margin: 0;
}

.result__secondary {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-2);
}

.result__note {
  font-size: var(--ht-text-1);
  color: var(--ht-ink-muted);
}

.result :deep(a > .app-button),
.result > .app-button {
  width: 100%;
}
</style>
