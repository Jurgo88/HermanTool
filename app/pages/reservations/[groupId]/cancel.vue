<script setup lang="ts">
// W2, S-05; issue #93 follow-up (IR-12 Checkout). Stripe's own cancelUrl
// (server/api/payments/checkout-session.post.ts) — the Customer backed
// out of Stripe's hosted page without paying. The Pending hold this
// ReservationGroup made is left in place and expires on its own via the
// ordinary D-18/FR-08 sweep (same "no saga machinery" stance as
// checkout.post.ts's own comment); nothing to undo here. Not the
// cancellation surface — W11 is blocked on OQ #1.
import { sk } from '~/i18n/sk'

definePageMeta({ layout: 'public' })
</script>

<template>
  <main class="result">
    <h1>{{ sk.checkoutResult.cancelTitle }}</h1>
    <p>{{ sk.checkoutResult.cancelBody }}</p>
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
