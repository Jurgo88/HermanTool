<!-- D-43; docs/design/interface-design-foundation.md §2, §6. The Visitor/
  Customer surface: light, calm, honest about money. No chrome beyond the
  page itself — S-01/S-03/S-06/S-07 each own their own header. The footer
  is the one shared element: S-07's legal pages must be reachable from
  everywhere on this surface, not just from checkout. theme-color
  (WP-6.1, §9) matches this surface's light --ht-paper. -->
<script setup lang="ts">
import { sk } from '~/i18n/sk'

// The Visitor's installable application (NFR-12), light chrome.
usePwaHead('public')
</script>

<template>
  <div class="public-surface">
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
  display: flex;
  flex-direction: column;
}

.public-surface__footer {
  margin-top: auto;
  padding: var(--ht-space-5);
  display: flex;
  gap: var(--ht-space-4);
  justify-content: center;
  font-size: var(--ht-text-2);
  color: var(--ht-ink-muted);
}
</style>
