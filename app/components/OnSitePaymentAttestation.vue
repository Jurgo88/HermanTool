<!-- S-10 on-site payment (D-65, P6, D-48; issue #215). Before HandoverOut
  of a group paid on site, the Operator takes the rental fee through the
  Tenant's eKasa and attests it here: method and amount, PIN-gated per
  attestation. The amount due comes from the server (undiscounted); the
  platform moves no money and issues no receipt. Shows only what the
  server confirmed (§7.1). For a group paid online it says so and asks
  for nothing. -->
<script setup lang="ts">
import { sk } from '~/i18n/sk'
import { formatDateTime, formatMoney, type MonetaryAmountView } from '~/utils/format'
import { getErrorCode } from '~/utils/error-code'

type Method = 'cash' | 'card_terminal' | 'qr'

interface StatusView {
  paymentMethod: 'online' | 'on_site'
  rentalFeeDue: MonetaryAmountView | null
  current: { id: number; amount: MonetaryAmountView; method: Method; attestedAt: string } | null
}

const props = defineProps<{ reservationGroupId: number }>()
const emit = defineEmits<{ attested: [] }>()

const status = ref<StatusView | null>(null)
const loadState = ref<'loading' | 'loaded' | 'error'>('loading')
const method = ref<Method>('cash')
const showPin = ref(false)
const submitting = ref(false)
const error = ref<string | null>(null)

async function load() {
  loadState.value = 'loading'
  try {
    status.value = await $fetch<StatusView>(
      `/api/handover/reservation-groups/${props.reservationGroupId}/on-site-payment`,
    )
    loadState.value = 'loaded'
  } catch {
    loadState.value = 'error'
  }
}

watch(() => props.reservationGroupId, load, { immediate: true })

async function attest(pin: string) {
  if (!status.value?.rentalFeeDue) return
  submitting.value = true
  error.value = null
  try {
    await $fetch(`/api/handover/reservation-groups/${props.reservationGroupId}/on-site-payment`, {
      method: 'POST',
      body: { amount: status.value.rentalFeeDue, method: method.value, pin },
    })
    showPin.value = false
    await load()
    emit('attested')
  } catch (err) {
    const code = getErrorCode(err)
    error.value =
      (code ? (sk.errors.operator as Record<string, string>)[code] : undefined) ??
      sk.common.somethingWentWrong
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="on-site-payment" aria-labelledby="on-site-payment-heading">
    <h3 id="on-site-payment-heading">{{ sk.onSitePayment.heading }}</h3>
    <p v-if="loadState === 'loading'" aria-busy="true">{{ sk.onSitePayment.loading }}</p>
    <div v-else-if="loadState === 'error'" class="on-site-payment__row">
      <AppAlert :message="sk.onSitePayment.loadError" />
      <AppButton variant="secondary" size="counter" @click="load">
        {{ sk.onSitePayment.retryAction }}
      </AppButton>
    </div>
    <template v-else-if="status">
      <p v-if="status.paymentMethod === 'online'" class="on-site-payment__done">
        {{ sk.onSitePayment.paidOnline }}
      </p>
      <p v-else-if="status.current" class="on-site-payment__done" role="status">
        {{
          sk.onSitePayment.attested
            .replace('{amount}', formatMoney(status.current.amount))
            .replace('{method}', sk.onSitePayment.methods[status.current.method])
            .replace('{time}', formatDateTime(status.current.attestedAt))
        }}
      </p>
      <form v-else class="on-site-payment__form" @submit.prevent="showPin = true">
        <p v-if="status.rentalFeeDue" class="on-site-payment__due">
          {{ sk.onSitePayment.due.replace('{amount}', formatMoney(status.rentalFeeDue)) }}
        </p>
        <p class="on-site-payment__hint">{{ sk.onSitePayment.ekasaHint }}</p>
        <fieldset class="on-site-payment__methods">
          <legend>{{ sk.onSitePayment.methodLegend }}</legend>
          <label v-for="option in ['cash', 'card_terminal', 'qr'] as const" :key="option">
            <input v-model="method" type="radio" :value="option" />
            {{ sk.onSitePayment.methods[option] }}
          </label>
        </fieldset>
        <AppAlert :message="error" />
        <AppButton
          type="submit"
          variant="primary"
          size="counter"
          :disabled="!status.rentalFeeDue"
          :pending="submitting"
        >
          {{ sk.onSitePayment.attestAction }}
        </AppButton>
        <p class="on-site-payment__hint">{{ sk.onSitePayment.requiredHint }}</p>
      </form>
    </template>
    <PinPrompt
      :open="showPin"
      :pending="submitting"
      :pending-label="sk.onSitePayment.submitting"
      @confirm="attest"
      @close="showPin = false"
    />
  </section>
</template>

<style scoped>
.on-site-payment {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-2);
  padding: var(--ht-space-4);
  margin-bottom: var(--ht-space-4);
  border: var(--ht-line-width) solid var(--ht-line-strong);
  border-radius: var(--ht-radius-card);
  background: var(--ht-surface);
}

.on-site-payment h3 {
  margin: 0;
}

.on-site-payment__due {
  margin: 0;
  font-family: var(--ht-font-money);
  font-size: var(--ht-text-5);
}

.on-site-payment__hint {
  margin: 0;
  color: var(--ht-ink-muted);
  font-size: var(--ht-text-1);
}

.on-site-payment__done {
  margin: 0;
  color: var(--ht-ok);
  font-weight: 600;
}

.on-site-payment__form,
.on-site-payment__row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ht-space-2);
}

.on-site-payment__methods {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ht-space-3);
  border: 0;
  padding: 0;
  margin: 0;
}

.on-site-payment__methods label {
  display: inline-flex;
  align-items: center;
  gap: var(--ht-space-1);
  min-height: var(--ht-hit-counter);
}
</style>
