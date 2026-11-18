<script setup lang="ts">
// S-28 Odhlásenie z ponúk (#216; D-14, P7): the link in every marketing
// e-mail. No login. Opening the page changes nothing; the button records
// the withdrawal, which wins over any earlier consent. Idempotent.
import { sk } from '~/i18n/sk'
import { getErrorCode } from '~/utils/error-code'

definePageMeta({ layout: 'public', hero: true })

const token = String(useRoute().params.token ?? '')
const status = ref<'idle' | 'pending' | 'done' | 'error'>('idle')
const error = ref<string | null>(null)

async function unsubscribe() {
  status.value = 'pending'
  error.value = null
  try {
    await $fetch(`/api/public/marketing-unsubscribe/${encodeURIComponent(token)}`, {
      method: 'POST',
    })
    status.value = 'done'
  } catch (err) {
    const code = getErrorCode(err)
    error.value =
      (code ? (sk.errors.customer as Record<string, string>)[code] : undefined) ??
      sk.common.somethingWentWrong
    status.value = 'error'
  }
}
</script>

<template>
  <main class="unsubscribe">
    <PublicHero>
      <h1>{{ sk.marketingUnsubscribe.title }}</h1>
    </PublicHero>
    <section class="unsubscribe__card">
      <p v-if="status === 'done'" role="status">{{ sk.marketingUnsubscribe.done }}</p>
      <template v-else>
        <p>{{ sk.marketingUnsubscribe.lead }}</p>
        <AppAlert :message="error" />
        <AppButton variant="primary" :pending="status === 'pending'" @click="unsubscribe">
          {{ sk.marketingUnsubscribe.action }}
        </AppButton>
      </template>
      <NuxtLink to="/">{{ sk.marketingUnsubscribe.backToCatalogAction }}</NuxtLink>
    </section>
  </main>
</template>

<style scoped>
.unsubscribe {
  width: 100%;
}

.unsubscribe__card {
  position: relative;
  box-sizing: border-box;
  max-width: 680px;
  margin: calc(var(--ht-hero-overlap) * -1) auto 0;
  padding: var(--ht-space-5) var(--ht-space-4);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ht-space-3);
  background: var(--ht-surface);
  border-radius: var(--ht-radius-card);
  box-shadow: var(--ht-shadow-card);
}
</style>
