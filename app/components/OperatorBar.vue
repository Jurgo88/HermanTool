<!-- C-20 (D-43, UIF-05, NFR-09, FR-34; docs/design/interface-design-foundation.md
  §5, §6 S-23). The admin app shell's one persistent element: who is
  signed in (attribution is only meaningful if the Operator can see
  themselves), navigation between admin surfaces, an explicit counter
  entry, and logout. Own its own "who am I" fetch rather than take
  displayName as a prop — every page under the admin layout is already
  guaranteed authenticated, so this component owning the concern keeps
  the layout itself trivial. -->
<script setup lang="ts">
import { sk } from '~/i18n/sk'

const nuxtApp = useNuxtApp()
const requestFetch = useRequestFetch()

const displayName = ref<string | null>(null)
const loggingOut = ref(false)

async function load() {
  try {
    const me = await requestFetch<{ displayName: string }>('/api/operators/me')
    displayName.value = me.displayName
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode
    if (statusCode === 401) {
      await nuxtApp.runWithContext(() => navigateTo('/login'))
    }
  }
}

async function logout() {
  loggingOut.value = true
  try {
    await $fetch('/api/auth/logout', { method: 'POST' })
  } finally {
    await nuxtApp.runWithContext(() => navigateTo('/login'))
  }
}

await load()
</script>

<template>
  <header class="operator-bar">
    <nav class="operator-bar__nav">
      <NuxtLink to="/admin/catalog">{{ sk.operatorBar.catalogLink }}</NuxtLink>
      <NuxtLink to="/admin/asset-registry">{{ sk.operatorBar.assetRegistryLink }}</NuxtLink>
      <NuxtLink to="/admin/status">{{ sk.operatorBar.statusLink }}</NuxtLink>
      <NuxtLink to="/admin/pin">{{ sk.operatorBar.pinLink }}</NuxtLink>
      <NuxtLink to="/admin/counter" class="operator-bar__counter-link">{{ sk.operatorBar.counterLink }}</NuxtLink>
    </nav>
    <div class="operator-bar__identity">
      <span v-if="displayName">{{ sk.operatorBar.signedInAs.replace('{name}', displayName) }}</span>
      <AppButton variant="quiet" :pending="loggingOut" @click="logout">
        {{ loggingOut ? sk.operatorBar.loggingOut : sk.operatorBar.logoutAction }}
      </AppButton>
    </div>
  </header>
</template>

<style scoped>
.operator-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ht-space-3);
  padding: var(--ht-space-3) var(--ht-space-4);
  background: var(--ht-surface);
  border-bottom: 1px solid var(--ht-line);
}

.operator-bar__nav {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ht-space-4);
  font-size: var(--ht-text-2);
}

.operator-bar__counter-link {
  font-weight: 600;
  color: var(--ht-signal-deep);
}

.operator-bar__identity {
  display: flex;
  align-items: center;
  gap: var(--ht-space-3);
  font-size: var(--ht-text-2);
  color: var(--ht-ink-muted);
}
</style>
