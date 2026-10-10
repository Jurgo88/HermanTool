<!-- D-43, D-59; docs/design/interface-design-foundation.md §2, §4.3, §6.
  The Visitor/Customer surface: light, calm, honest about money, under
  the Tenant's own identity, Rent Star. The header is shared by S-01…S-07:
  wordmark home, the terms (S-07, also in the footer) and the Reservation
  draft. Only this header carries a gradient (D-59). theme-color (WP-6.1,
  §9) stays this surface's light --ht-paper. -->
<script setup lang="ts">
import { sk } from '~/i18n/sk'

// The Visitor's installable application (NFR-12), light chrome.
usePwaHead('public')

const { lines } = useReservationDraft()
const draftUnits = computed(() => lines.value.reduce((sum, line) => sum + line.quantity, 0))
</script>

<template>
  <div class="public-surface" data-surface="public">
    <header class="public-header">
      <div class="public-header__inner">
        <NuxtLink to="/" class="public-header__brand" :aria-label="sk.publicHeader.homeLabel">
          <span class="public-header__wordmark">{{ sk.publicHeader.brandName }}</span>
          <span class="public-header__tagline">{{ sk.publicHeader.tagline }}</span>
        </NuxtLink>
        <nav class="public-header__nav" :aria-label="sk.publicHeader.navLabel">
          <NuxtLink to="/podmienky" class="public-header__terms">{{
            sk.publicHeader.termsLink
          }}</NuxtLink>
          <NuxtLink v-if="draftUnits > 0" to="/checkout" class="public-header__draft">
            {{ sk.publicHeader.draftLink.replace('{count}', String(draftUnits)) }}
          </NuxtLink>
        </nav>
      </div>
    </header>
    <slot />
    <footer class="public-surface__footer">
      <NuxtLink to="/podmienky">{{ sk.publicFooter.termsLink }}</NuxtLink>
      <NuxtLink to="/sukromie">{{ sk.publicFooter.privacyLink }}</NuxtLink>
    </footer>
  </div>
</template>

<style scoped>
.public-surface {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

.public-header {
  background: var(--ht-header-gradient);
  border-radius: var(--ht-header-curve);
  color: var(--ht-on-brand);
}

.public-header__inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: calc(var(--ht-space-5) + var(--ht-safe-top)) max(var(--ht-space-4), var(--ht-safe-right))
    var(--ht-space-6) max(var(--ht-space-4), var(--ht-safe-left));
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ht-space-4);
}

.public-header__brand {
  display: flex;
  flex-direction: column;
  text-decoration: none;
  color: inherit;
}

.public-header__wordmark {
  font-family: var(--ht-font-condensed);
  font-weight: 600;
  font-size: var(--ht-text-6);
  line-height: 1.1;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.public-header__tagline {
  font-family: var(--ht-font-condensed);
  font-weight: 600;
  font-size: var(--ht-text-2);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.public-header__nav {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ht-space-3);
  align-items: center;
}

.public-header__terms,
.public-header__draft {
  display: inline-flex;
  align-items: center;
  min-height: var(--ht-hit-min);
  padding: 0 var(--ht-space-4);
  border-radius: var(--ht-radius-card);
  font-family: var(--ht-font-condensed);
  font-weight: 600;
  font-size: var(--ht-text-2);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  text-decoration: none;
}

/* Its own solid ground: on wide screens it sits over the gradient's pale
 * end, where white text on the gradient alone would fail NFR-11. */
.public-header__terms {
  background: var(--ht-brand-deep);
  color: var(--ht-on-brand);
  border: 1px solid var(--ht-on-brand);
}

.public-header__draft {
  background: var(--ht-surface);
  color: var(--ht-brand-deep);
}

.public-header a:focus-visible {
  outline: 3px solid var(--ht-on-brand);
  outline-offset: 2px;
}

.public-surface__footer {
  margin-top: auto;
  padding: var(--ht-space-5) var(--ht-space-5) calc(var(--ht-space-5) + var(--ht-safe-bottom));
  display: flex;
  gap: var(--ht-space-4);
  justify-content: center;
  font-size: var(--ht-text-2);
  color: var(--ht-ink-muted);
}
</style>
