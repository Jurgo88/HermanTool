<!-- C-08 (D-43, D-47; docs/design/interface-design-foundation.md §3 UI-D-05,
  §5). A DERIVED fact (Overdue, NoShow, shortfall risk — FR-28) — dashed
  outline, transparent fill, never the solid StateChip (C-07) treatment a
  stored state gets. The visual difference IS the difference between a
  fact the system stores and a fact it computes; this rule has no
  exceptions. Slot holds the label (real sk.ts copy, D-20 — wording
  varies by context: "Po termíne", "Nedostavil sa", "Chýba 2 dni"). -->
<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'overdue' | 'noshow' }>(), { tone: 'overdue' })
</script>

<template>
  <span class="derived-badge" :class="`derived-badge--${tone}`">
    <slot />
  </span>
</template>

<style scoped>
.derived-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--ht-font-condensed);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: var(--ht-text-1);
  padding: 3px 7px;
  border-radius: var(--ht-radius-plate);
  background: transparent;
  border: 1px dashed var(--ht-derived-overdue);
  color: var(--ht-derived-overdue);
}

.derived-badge--noshow {
  border-color: var(--ht-derived-noshow);
  color: var(--ht-derived-noshow);
}
</style>
