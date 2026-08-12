<!-- C-16 (D-47; docs/design/interface-design-foundation.md §3 UI-D-05, §5).
  Expected vs actual as two labelled lines, never merged into one — the
  worklist and history primitive. Default slot holds whatever comes
  after (a DerivedBadge, a note, an action button). -->
<script setup lang="ts">
defineProps<{
  title: string
  expectedLabel: string
  expectedValue: string
  actualLabel: string
  actualValue: string
}>()
</script>

<template>
  <div class="two-clock-row">
    <div class="two-clock-row__title">{{ title }}</div>
    <div class="two-clock-row__clock">
      <span class="two-clock-row__key">{{ expectedLabel }}</span>
      <span class="two-clock-row__value">{{ expectedValue }}</span>
    </div>
    <div class="two-clock-row__clock">
      <span class="two-clock-row__key">{{ actualLabel }}</span>
      <span class="two-clock-row__value">{{ actualValue }}</span>
    </div>
    <div v-if="$slots.default" class="two-clock-row__extra">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.two-clock-row {
  background: var(--ht-surface);
  border: 1px solid var(--ht-line);
  border-radius: var(--ht-radius-plate);
  padding: var(--ht-space-3);
  margin-bottom: var(--ht-space-2);
}

.two-clock-row__title {
  font-weight: 600;
  font-size: var(--ht-text-3);
  margin-bottom: var(--ht-space-1);
}

.two-clock-row__clock {
  display: flex;
  gap: var(--ht-space-2);
  font-size: var(--ht-text-2);
  color: var(--ht-ink-muted);
}

.two-clock-row__key {
  font-family: var(--ht-font-condensed);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: var(--ht-text-1);
  min-width: 90px;
  color: var(--ht-ink-muted);
}

.two-clock-row__value {
  font-family: var(--ht-font-mono);
  font-size: var(--ht-text-2);
  color: var(--ht-ink);
}

.two-clock-row__extra {
  margin-top: var(--ht-space-2);
}
</style>
