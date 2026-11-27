<script setup lang="ts">
// S-07, P7, D-42, D-52, D-61, #247. The privacy notice (GDPR Art. 13),
// drafted for counsel and shown in the `draft.` slot until legal review
// approves it. Open retention periods (OQ #27) stay `[doplniť]` in the
// text itself. Referenced from checkout (S-03) and the site footer.
// Same reading layout as the terms (podmienky.vue).
import { sk } from '~/i18n/sk'

definePageMeta({ layout: 'public' })

const privacy = sk.draft.privacy
const sectionId = (index: number) => `clanok-${index + 1}`
</script>

<template>
  <div class="legal-shell">
    <header class="legal-head">
      <h1 class="legal-head__title">{{ sk.legalPrivacy.title }}</h1>
      <p class="legal-head__meta">
        {{ privacy.dateLabel }} · {{ sk.legalTerms.versionLabel.replace('{version}', privacy.version) }}
      </p>
    </header>
    <main class="legal-page">
      <DraftNotice>
        <p>{{ sk.draft.privacyPageBody }}</p>
      </DraftNotice>

      <nav class="legal-page__contents" :aria-label="privacy.contentsHeading">
        <h2 class="legal-page__contents-heading">{{ privacy.contentsHeading }}</h2>
        <ol>
          <li v-for="(section, index) in privacy.sections" :key="section.heading">
            <a :href="`#${sectionId(index)}`">{{ section.heading }}</a>
          </li>
        </ol>
      </nav>

      <section
        v-for="(section, index) in privacy.sections"
        :id="sectionId(index)"
        :key="section.heading"
        class="legal-page__section"
      >
        <h2>{{ section.heading }}</h2>
        <template v-for="(part, partIndex) in section.body" :key="partIndex">
          <ul v-if="Array.isArray(part)">
            <li v-for="entry in part" :key="entry">{{ entry }}</li>
          </ul>
          <p v-else>{{ part }}</p>
        </template>
      </section>

      <div class="legal-page__actions">
        <NuxtLink to="/"><AppButton variant="secondary">{{ sk.legalPrivacy.backToCatalogAction }}</AppButton></NuxtLink>
      </div>
    </main>
  </div>
</template>

<style scoped>
.legal-shell {
  width: 100%;
}

.legal-head {
  box-sizing: border-box;
  width: calc(100% - var(--ht-space-4) * 2);
  max-width: 680px;
  margin: 0 auto;
  padding: var(--ht-space-5) 0 var(--ht-space-4);
}

.legal-head__title {
  margin: 0;
}

.legal-head__meta {
  margin: var(--ht-space-1) 0 0;
  color: var(--ht-ink-muted);
  font-size: var(--ht-text-2);
}

.legal-page {
  box-sizing: border-box;
  width: calc(100% - var(--ht-space-4) * 2);
  max-width: 680px;
  margin: 0 auto var(--ht-space-7);
  padding: var(--ht-space-5) var(--ht-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-5);
  line-height: 1.6;
  background: var(--ht-surface);
  border-radius: var(--ht-radius-card);
  box-shadow: var(--ht-shadow-card);
}

@media (min-width: 720px) {
  .legal-page {
    padding: var(--ht-space-6);
  }
}

.legal-page__contents {
  padding: var(--ht-space-4);
  background: var(--ht-paper);
  border-radius: var(--ht-radius-card);
}

.legal-page__contents-heading {
  margin: 0 0 var(--ht-space-2);
  font-size: var(--ht-text-3);
}

.legal-page__contents ol {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.legal-page__contents a {
  display: flex;
  align-items: center;
  min-height: var(--ht-hit-min);
}

.legal-page__section {
  scroll-margin-top: var(--ht-space-5);
}

.legal-page__section h2 {
  margin: 0 0 var(--ht-space-2);
  font-size: var(--ht-text-4);
}

.legal-page__section p,
.legal-page__section ul {
  margin: 0 0 var(--ht-space-3);
}

.legal-page__section ul {
  padding-left: var(--ht-space-5);
}

.legal-page__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ht-space-3);
}
</style>
