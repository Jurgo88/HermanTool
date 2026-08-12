<script setup lang="ts">
// S-07, FR-38, IR-13, D-52; issue for WP-4.4. Structure now, content in
// the `draft.` slot — the privacy notice waits on legal review (OQ #2,
// OQ #4, OQ #27: retention windows and basis for both IdentityEvidence
// and Customer records). Referenced from checkout (S-03) and the site
// footer.
import { sk } from '~/i18n/sk'

definePageMeta({ layout: 'public' })
</script>

<template>
  <main class="legal-page">
    <h1>{{ sk.legalPrivacy.title }}</h1>
    <DraftNotice>
      <p>{{ sk.draft.privacyPageBody }}</p>
    </DraftNotice>
    <NuxtLink to="/"><AppButton variant="secondary">{{ sk.legalPrivacy.backToCatalogAction }}</AppButton></NuxtLink>
  </main>
</template>

<style scoped>
.legal-page {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--ht-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-4);
}
</style>
