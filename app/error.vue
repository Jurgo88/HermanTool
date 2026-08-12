<!-- S-24 (NFR-11, D-20; docs/design/interface-design-foundation.md §6). One
  screen, Slovak, no stack traces — Nuxt's global error boundary, for
  both an unmatched route and a thrown server error. tokens.css/base.css
  are global CSS (nuxt.config.ts), not layout-scoped, so this renders
  correctly with no layout at all. "A route home per surface": the
  errored URL decides whether home is the counter, the admin catalog, or
  the public catalog — there is no single right "home" across all three. -->
<script setup lang="ts">
import { sk } from '~/i18n/sk'
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()

const isNotFound = computed(() => props.error.statusCode === 404)

const route = useRoute()

const homePath = computed(() => {
  const path = route.path
  if (path.startsWith('/admin/counter')) return '/admin/counter'
  if (path.startsWith('/admin')) return '/admin/catalog'
  return '/'
})

function goHome() {
  clearError({ redirect: homePath.value })
}
</script>

<template>
  <main class="error-page">
    <h1>{{ isNotFound ? sk.errorPage.notFoundTitle : sk.errorPage.genericTitle }}</h1>
    <p>{{ isNotFound ? sk.errorPage.notFoundBody : sk.errorPage.genericBody }}</p>
    <AppButton variant="primary" @click="goHome">{{ sk.errorPage.homeAction }}</AppButton>
  </main>
</template>

<style scoped>
.error-page {
  min-height: 100vh;
  max-width: 480px;
  margin: 0 auto;
  padding: var(--ht-space-5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ht-space-4);
  text-align: center;
  background: var(--ht-paper);
  color: var(--ht-ink);
  font-family: var(--ht-font-sans);
}
</style>
