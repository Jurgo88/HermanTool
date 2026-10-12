<script setup lang="ts">
// W2, D-26, S-04; issue #93 follow-up (IR-12 Checkout). Stripe's own
// successUrl (server/api/payments/checkout-session.post.ts) — the
// browser lands here immediately after a successful card payment, but
// confirmation itself is driven by the Stripe webhook
// (server/api/webhooks/stripe.post.ts), which can arrive slightly later
// than this redirect. This page deliberately does not poll for or claim
// a confirmed status; it only acknowledges the payment step completed.
import { sk } from '~/i18n/sk'
import type { DraftReservationLine } from '~/composables/useReservationDraft'
import { orderForDisplay } from '~/utils/reservation-draft'

definePageMeta({ layout: 'public', hero: true })

// #190: the payment went through, so the draft and the unpaid-group marker
// kept for resuming are done. After the stored draft is read, or it would
// come back. What was in it is kept for this page, as the Customer's own
// summary of what they just paid for.
const { lines, restored, finishCheckout } = useReservationDraft()
const paidLines = ref<DraftReservationLine[]>([])
watch(
  restored,
  (isRestored) => {
    if (!isRestored) return
    paidLines.value = lines.value.map((line) => ({ ...line, period: { ...line.period } }))
    finishCheckout()
  },
  { immediate: true },
)
const summary = computed(() => orderForDisplay(paidLines.value))
</script>

<template>
  <main class="result-page">
    <PublicHero>
      <div class="result__hero">
        <span class="result__mark" aria-hidden="true" />
        <h1>{{ sk.checkoutResult.successTitle }}</h1>
        <p>{{ sk.checkoutResult.successBody }}</p>
      </div>
    </PublicHero>

    <div class="result">

    <section v-if="summary.length > 0" class="result__card" aria-labelledby="result-summary">
      <h2 id="result-summary" class="result__heading">{{ sk.checkoutResult.summaryHeading }}</h2>
      <ul class="result__lines">
        <li
          v-for="{ line, isAccessory } in summary"
          :key="`${line.assetTypeId}-${line.period.startDay}-${line.period.endDay}`"
          :class="{ 'result__line--accessory': isAccessory }"
        >
          <span class="result__line-name">{{ line.assetTypeName }}</span>
          <span class="result__line-meta">
            <DayRange :start-day="line.period.startDay" :end-day="line.period.endDay" />
            · {{ sk.checkout.unitCount.replace('{count}', String(line.quantity)) }}
          </span>
        </li>
      </ul>
    </section>

    <section class="result__card" aria-labelledby="result-next">
      <h2 id="result-next" class="result__heading">{{ sk.checkoutResult.nextHeading }}</h2>
      <ol class="result__steps">
        <li v-for="step in sk.checkoutResult.nextSteps" :key="step">{{ step }}</li>
      </ol>
    </section>

    <NuxtLink to="/" class="result__action">
      <AppButton variant="primary">{{ sk.checkoutResult.backToCatalogAction }}</AppButton>
    </NuxtLink>
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
  align-items: center;
  gap: var(--ht-space-3);
  text-align: center;
}

/* Rises into the hero band. */
.result {
  position: relative;
  box-sizing: border-box;
  max-width: 520px;
  margin: calc(var(--ht-hero-overlap) * -1) auto 0;
  padding: 0 var(--ht-space-4) var(--ht-space-7);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ht-space-4);
}

/* A drawn check mark in a circle, no icon font. */
.result__mark {
  position: relative;
  width: var(--ht-space-7);
  height: var(--ht-space-7);
  border-radius: 50%;
  background: var(--ht-surface);
  box-shadow: 0 0 0 var(--ht-space-2) var(--ht-on-brand-glass);
}

.result__mark::after {
  content: '';
  position: absolute;
  left: 36%;
  top: 22%;
  width: 24%;
  height: 44%;
  border: solid var(--ht-ok);
  border-width: 0 var(--ht-space-1) var(--ht-space-1) 0;
  transform: rotate(45deg);
}

.result__card {
  width: 100%;
  box-sizing: border-box;
  padding: var(--ht-space-5) var(--ht-space-4);
  background: var(--ht-surface);
  border-radius: calc(var(--ht-radius-card) + var(--ht-space-1));
  box-shadow: var(--ht-shadow-card);
  text-align: left;
}

.result__heading {
  margin: 0 0 var(--ht-space-3);
  font-size: var(--ht-text-4);
}

.result__lines {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.result__lines li {
  display: flex;
  flex-direction: column;
  padding: var(--ht-space-2) 0;
}

.result__lines li + li {
  border-top: 1px solid var(--ht-line);
}

.result__lines .result__line--accessory {
  padding-left: var(--ht-space-4);
}

.result__line-name {
  font-weight: 600;
}

.result__line-meta {
  font-size: var(--ht-text-2);
  color: var(--ht-ink-muted);
}

/* Numbered steps joined by a line, so the order reads at a glance. */
.result__steps {
  counter-reset: step;
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-3);
}

.result__steps li {
  counter-increment: step;
  position: relative;
  padding-left: calc(var(--ht-space-6) + var(--ht-space-2));
  min-height: var(--ht-space-6);
}

.result__steps li::before {
  content: counter(step);
  position: absolute;
  left: 0;
  top: 0;
  width: var(--ht-space-6);
  height: var(--ht-space-6);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--ht-button-primary-bg);
  color: var(--ht-on-brand);
  font-weight: 600;
}

.result__action {
  margin-top: var(--ht-space-2);
}
</style>
