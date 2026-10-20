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
import { loginLocation } from '~/utils/operator-redirect'

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
      await nuxtApp.runWithContext(() => navigateTo(loginLocation(useRoute().fullPath)))
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
    <div class="operator-bar__top">
      <NuxtLink to="/admin/catalog" class="operator-bar__brand">
        <span class="operator-bar__wordmark">{{ sk.operatorBar.brandName }}</span>
        <span class="operator-bar__suffix">{{ sk.operatorBar.brandSuffix }}</span>
      </NuxtLink>

      <!-- On a wide screen the links sit in this row; on a phone they move to
        a row of their own below, which scrolls sideways. -->
      <nav class="operator-bar__nav" :aria-label="sk.operatorBar.navLabel">
        <NuxtLink to="/admin/catalog" class="operator-bar__link" active-class="operator-bar__link--active">
          {{ sk.operatorBar.catalogLink }}
        </NuxtLink>
        <NuxtLink
          to="/admin/asset-registry"
          class="operator-bar__link"
          active-class="operator-bar__link--active"
        >
          {{ sk.operatorBar.assetRegistryLink }}
        </NuxtLink>
        <NuxtLink to="/admin/status" class="operator-bar__link" active-class="operator-bar__link--active">
          {{ sk.operatorBar.statusLink }}
        </NuxtLink>
        <NuxtLink to="/admin/pin" class="operator-bar__link" active-class="operator-bar__link--active">
          {{ sk.operatorBar.pinLink }}
        </NuxtLink>
      </nav>

      <div class="operator-bar__identity">
        <span v-if="displayName" class="operator-bar__who">
          {{ sk.operatorBar.signedInAs.replace('{name}', displayName) }}
        </span>
        <NuxtLink to="/admin/counter" class="operator-bar__counter-link">
          {{ sk.operatorBar.counterLink }}
        </NuxtLink>
        <button type="button" class="operator-bar__logout" :disabled="loggingOut" @click="logout">
          {{ loggingOut ? sk.operatorBar.loggingOut : sk.operatorBar.logoutAction }}
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
@media print {
  .operator-bar {
    display: none;
  }
}

/* The Operator's own chrome: the counter's dark ground and yellow signal,
 * so the admin and the counter read as one application. */
.operator-bar {
  background: var(--ht-ink);
  color: var(--ht-paper);
  padding-top: var(--ht-safe-top);
}

.operator-bar__top {
  max-width: 1200px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-areas: 'brand nav identity';
  align-items: center;
  gap: var(--ht-space-4);
  padding: 0 max(var(--ht-space-4), var(--ht-safe-right)) 0 max(var(--ht-space-4), var(--ht-safe-left));
  min-height: calc(var(--ht-hit-min) + var(--ht-space-4));
}

.operator-bar__brand {
  grid-area: brand;
  display: inline-flex;
  align-items: baseline;
  gap: var(--ht-space-2);
  color: inherit;
  text-decoration: none;
}

.operator-bar__wordmark {
  font-family: var(--ht-font-condensed);
  font-weight: 700;
  font-size: var(--ht-text-4);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.operator-bar__suffix {
  font-family: var(--ht-font-condensed);
  font-weight: 600;
  font-size: var(--ht-text-1);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ht-signal);
}

.operator-bar__nav {
  grid-area: nav;
  display: flex;
  gap: var(--ht-space-1);
  overflow-x: auto;
  scrollbar-width: none;
}

.operator-bar__nav::-webkit-scrollbar {
  display: none;
}

.operator-bar__link {
  flex: none;
  display: inline-flex;
  align-items: center;
  min-height: var(--ht-hit-min);
  padding: 0 var(--ht-space-3);
  border-bottom: 3px solid transparent;
  color: var(--ht-line-strong);
  font-weight: 600;
  font-size: var(--ht-text-2);
  text-decoration: none;
  transition:
    color var(--ht-motion),
    border-color var(--ht-motion);
}

.operator-bar__link:hover {
  color: var(--ht-paper);
}

.operator-bar__link--active {
  color: var(--ht-paper);
  border-bottom-color: var(--ht-signal);
}

.operator-bar__identity {
  grid-area: identity;
  display: flex;
  align-items: center;
  gap: var(--ht-space-3);
  font-size: var(--ht-text-2);
}

.operator-bar__who {
  color: var(--ht-line-strong);
}

.operator-bar__counter-link {
  display: inline-flex;
  align-items: center;
  min-height: var(--ht-hit-min);
  padding: 0 var(--ht-space-3);
  border-radius: var(--ht-radius-card);
  background: var(--ht-signal);
  color: var(--ht-on-signal);
  font-family: var(--ht-font-condensed);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  text-decoration: none;
}

.operator-bar__logout {
  min-height: var(--ht-hit-min);
  padding: 0 var(--ht-space-2);
  border: 0;
  background: transparent;
  color: var(--ht-line-strong);
  font: inherit;
  cursor: pointer;
}

.operator-bar__logout:hover {
  color: var(--ht-paper);
}

.operator-bar a:focus-visible,
.operator-bar button:focus-visible {
  outline: 3px solid var(--ht-signal);
  outline-offset: 2px;
}

/* Phone: brand and the counter in the first row, the links in a second,
 * scrollable row; the name gives way to them. */
@media (max-width: 419px) {
  .operator-bar__suffix {
    display: none;
  }
}

@media (max-width: 899px) {
  .operator-bar__top {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'brand identity'
      'nav nav';
    row-gap: 0;
    padding-top: var(--ht-space-2);
  }

  .operator-bar__who {
    display: none;
  }

  .operator-bar__counter-link {
    padding: 0 var(--ht-space-2);
    font-size: var(--ht-text-2);
  }

  .operator-bar__nav {
    margin: 0 calc(var(--ht-space-4) * -1);
    padding: 0 var(--ht-space-2);
  }
}
</style>
