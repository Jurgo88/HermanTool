<!-- D-52 (UI-D-10; docs/design/interface-design-foundation.md §3). The
  visible marker that pairs with sk.ts's `draft.` prefix and
  scripts/check-no-draft-copy.mjs: legally-blocked copy (OQ #1 terms and
  pre-contractual information, cancellation, FR-38/D-42/IR-13 privacy
  text) must never look like finished content. Wrap it in this. -->
<script setup lang="ts">
withDefaults(defineProps<{ label?: string }>(), { label: 'Návrh — čaká na právne schválenie' })
</script>

<template>
  <div class="draft-notice">
    <span class="draft-notice__eyebrow">{{ label }}</span>
    <div class="draft-notice__body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.draft-notice {
  border: 1px dashed var(--ht-warn);
  border-radius: var(--ht-radius-plate);
  padding: var(--ht-space-3);
}

.draft-notice__eyebrow {
  display: block;
  font-family: var(--ht-font-condensed);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: var(--ht-text-1);
  color: var(--ht-warn);
  margin-bottom: var(--ht-space-1);
}
</style>
