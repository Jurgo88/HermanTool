<script setup lang="ts">
// W2, D-26; issue #93 follow-up (IR-12 Checkout). Stripe's own
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
  <main>
    <h1>{{ sk.checkoutResult.successTitle }}</h1>
    <p>{{ sk.checkoutResult.successBody }}</p>
    <p><NuxtLink to="/">{{ sk.checkoutResult.backToCatalogAction }}</NuxtLink></p>
  </main>
</template>
