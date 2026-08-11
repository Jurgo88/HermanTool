<!-- C-15 (D-43, D-51, D-09; docs/design/interface-design-foundation.md
  §5). formatDayRange, consistently — no component formats a period
  inline. Both endDay and startDay are consumed days (D-09: the Asset
  returns to the pool the day AFTER endDay, never on it), so the range
  shown is always inclusive on both ends — never a "return by" date. -->
<script setup lang="ts">
import { formatDayRange } from '~/utils/format'

defineProps<{ startDay: string; endDay: string }>()
</script>

<template>
  <span class="day-range">{{ formatDayRange(startDay, endDay) }}</span>
</template>

<style scoped>
.day-range {
  font-variant-numeric: tabular-nums;
}
</style>
