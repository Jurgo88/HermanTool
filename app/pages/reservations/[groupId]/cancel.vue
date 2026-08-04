<script setup lang="ts">
// W2; issue #93 follow-up (IR-12 Checkout). Stripe's own cancelUrl
// (server/api/payments/checkout-session.post.ts) — the Customer backed
// out of Stripe's hosted page without paying. The Pending hold this
// ReservationGroup made is left in place and expires on its own via the
// ordinary D-18/FR-08 sweep (same "no saga machinery" stance as
// checkout.post.ts's own comment); nothing to undo here.
import { sk } from '~/i18n/sk'
</script>

<template>
  <main>
    <h1>{{ sk.checkoutResult.cancelTitle }}</h1>
    <p>{{ sk.checkoutResult.cancelBody }}</p>
    <p><NuxtLink to="/">{{ sk.checkoutResult.backToCatalogAction }}</NuxtLink></p>
  </main>
</template>
