<!-- C-23 (D-56, D-58; design foundation §5, S-01). One catalog grid cell:
  image (or a neutral placeholder, never a broken image), name and day
  rate. The whole card links to the S-02 detail. -->
<script setup lang="ts">
import { sk } from '~/i18n/sk'
import type { MonetaryAmountView } from '~/utils/format'

defineProps<{
  assetTypeId: number
  name: string
  dayRate: MonetaryAmountView
  imageFile: string | null
}>()
</script>

<template>
  <NuxtLink :to="`/naradie/${assetTypeId}`" class="asset-type-card">
    <div class="asset-type-card__image">
      <img
        v-if="imageFile"
        :src="`/catalog/${imageFile}`"
        alt=""
        loading="lazy"
        width="400"
        height="400"
      />
      <span v-else class="asset-type-card__placeholder">{{
        sk.publicCatalog.imagePlaceholder
      }}</span>
    </div>
    <span class="asset-type-card__name">{{ name }}</span>
    <span class="asset-type-card__rate">
      <MoneyAmount :amount="dayRate" /> {{ sk.publicCatalog.perDaySuffix }}
    </span>
  </NuxtLink>
</template>

<style scoped>
.asset-type-card {
  /* Fills its grid cell, so every card in a row is the same height. */
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-2);
  padding: var(--ht-space-3);
  background: var(--ht-surface);
  border: 1px solid var(--ht-line);
  border-radius: var(--ht-radius-card);
  color: var(--ht-ink);
  text-decoration: none;
  transition: border-color var(--ht-motion) ease-out;
}

.asset-type-card:hover {
  border-color: var(--ht-brand);
}

.asset-type-card:focus-visible {
  outline: 3px solid var(--ht-signal-deep);
  outline-offset: 2px;
}

.asset-type-card__image {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ht-surface);
}

.asset-type-card__image img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.asset-type-card__placeholder {
  color: var(--ht-ink-muted);
  font-size: var(--ht-text-2);
  text-align: center;
}

.asset-type-card__name {
  /* Takes the spare height, so the price always sits on the bottom edge. */
  flex: 1 1 auto;
  font-family: var(--ht-font-condensed);
  font-weight: 600;
  font-size: var(--ht-text-3);
  text-align: center;
}

.asset-type-card__rate {
  text-align: center;
  color: var(--ht-brand-deep);
  font-weight: 600;
}

@media (prefers-reduced-motion: reduce) {
  .asset-type-card {
    transition: none;
  }
}
</style>
