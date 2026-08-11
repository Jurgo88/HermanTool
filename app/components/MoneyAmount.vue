<!-- C-14 (D-43, D-51, D-21; docs/design/interface-design-foundation.md
  §5). Mono, via formatMoney — currency is always rendered, structurally:
  there is no prop that lets a caller show a bare number. -->
<script setup lang="ts">
import { formatMoney, type MonetaryAmountView } from '~/utils/format'

withDefaults(defineProps<{ amount: MonetaryAmountView; size?: 'default' | 'large' }>(), { size: 'default' })
</script>

<template>
  <span class="money-amount" :class="`money-amount--${size}`">{{ formatMoney(amount) }}</span>
</template>

<style scoped>
.money-amount {
  font-family: var(--ht-font-mono);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.money-amount--large {
  font-size: var(--ht-text-6);
  letter-spacing: -0.02em;
}
</style>
