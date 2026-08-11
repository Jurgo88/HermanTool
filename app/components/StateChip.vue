<!-- C-07 (D-43, D-47; docs/design/interface-design-foundation.md §3 UI-D-05,
  §5). A STORED fact only (Reservation state FR-07, Asset status) — a
  solid chip, never the hazard treatment DerivedBadge (C-08) uses for a
  DERIVED one (FR-28). `tone` rather than the raw state string, so this
  stays usable for both Reservation states and Asset statuses without
  needing to know every possible value of either. -->
<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'pending' | 'confirmed' | 'cancelled' | 'expired' | 'neutral'; label: string }>(), {
  tone: 'neutral',
})
</script>

<template>
  <span class="state-chip" :class="`state-chip--${tone}`">{{ label }}</span>
</template>

<style scoped>
.state-chip {
  display: inline-block;
  font-family: var(--ht-font-condensed);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: var(--ht-text-1);
  padding: 3px 7px;
  border-radius: var(--ht-radius-plate);
  color: #fff;
}

.state-chip--pending {
  background: var(--ht-state-pending);
}

.state-chip--confirmed {
  background: var(--ht-state-confirmed);
}

.state-chip--cancelled {
  background: var(--ht-state-cancelled);
}

.state-chip--expired {
  background: var(--ht-state-expired);
}

.state-chip--neutral {
  background: var(--ht-ink-muted);
}
</style>
