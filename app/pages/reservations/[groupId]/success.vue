<script setup lang="ts">
// W2, D-26, S-04; issue #93 follow-up (IR-12 Checkout). Stripe's own
// successUrl (server/api/payments/checkout-session.post.ts) — the
// browser lands here immediately after a successful card payment, but
// confirmation itself is driven by the Stripe webhook
// (server/api/webhooks/stripe.post.ts), which can arrive slightly later
// than this redirect. This page deliberately does not poll for or claim
// a confirmed status; it only acknowledges the payment step completed.
import { sk } from '~/i18n/sk'

definePageMeta({ layout: 'public' })
</script>

<template>
  <main class="result">
    <h1>{{ sk.checkoutResult.successTitle }}</h1>
    <p>{{ sk.checkoutResult.successBody }}</p>
    <NuxtLink to="/"><AppButton variant="primary">{{ sk.checkoutResult.backToCatalogAction }}</AppButton></NuxtLink>
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
</style>
