<!-- C-27 (D-59, style C). The brand band that continues the public header
  down behind a page's opening: title, a line of text, figures. Content that
  follows rises into it by pulling itself up by --ht-hero-overlap.
  A page that uses it sets definePageMeta({ hero: true }), so the header
  drops its curve and the two read as one band. `narrow` lines the text up
  with a single centred column of cards (checkout, terms). -->
<script setup lang="ts">
defineProps<{ narrow?: boolean }>()
</script>

<template>
  <section class="public-hero">
    <div class="public-hero__inner" :class="{ 'public-hero__inner--narrow': narrow }">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.public-hero {
  background: var(--ht-band-gradient);
  color: var(--ht-on-brand);
  border-radius: 0 0 var(--ht-radius-hero) var(--ht-radius-hero);
}

.public-hero__inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--ht-space-2) max(var(--ht-space-4), var(--ht-safe-right))
    calc(var(--ht-hero-overlap) + var(--ht-space-5)) max(var(--ht-space-4), var(--ht-safe-left));
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-3);
}

.public-hero__inner--narrow {
  max-width: 680px;
}

.public-hero :deep(h1) {
  margin: 0;
  font-size: var(--ht-text-5);
  line-height: 1.15;
  letter-spacing: -0.01em;
}

.public-hero :deep(p) {
  margin: 0;
  opacity: 0.92;
}

.public-hero :deep(a) {
  color: var(--ht-on-brand);
}

.public-hero :deep(a:focus-visible) {
  outline: 3px solid var(--ht-on-brand);
  outline-offset: 2px;
}

@media (min-width: 900px) {
  .public-hero :deep(h1) {
    font-size: calc(var(--ht-text-6) * 1.3);
  }
}
</style>
