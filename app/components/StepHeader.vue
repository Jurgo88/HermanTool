<!-- C-17 (D-46; docs/design/interface-design-foundation.md §3 UI-D-04).
  Counter task-stack header: workflow name, Customer, explicit back.
  `guardMessage` is shown via confirm() before back actually fires, for
  in-flight uploads or a pending PIN. -->
<script setup lang="ts">
import { sk } from '~/i18n/sk'

const props = withDefaults(
  defineProps<{ title: string; subtitle?: string | null; guardMessage?: string | null; showBack?: boolean }>(),
  { subtitle: null, guardMessage: null, showBack: true },
)
const emit = defineEmits<{ back: [] }>()

function handleBack() {
  if (props.guardMessage && !window.confirm(props.guardMessage)) return
  emit('back')
}
</script>

<template>
  <header class="step-header">
    <button v-if="showBack" type="button" class="step-header__back" :aria-label="sk.common.backAction" @click="handleBack">
      ←
    </button>
    <div class="step-header__text">
      <span class="step-header__title">{{ title }}</span>
      <span v-if="subtitle" class="step-header__subtitle">{{ subtitle }}</span>
    </div>
  </header>
</template>

<style scoped>
.step-header {
  display: flex;
  align-items: center;
  gap: var(--ht-space-3);
  padding: var(--ht-space-3) var(--ht-space-4);
  background: var(--ht-surface-sunk);
  border-bottom: 1px solid var(--ht-line);
}

.step-header__back {
  border: 0;
  background: transparent;
  color: var(--ht-ink);
  font-family: var(--ht-font-mono);
  font-size: var(--ht-text-4);
  line-height: 1;
  cursor: pointer;
  padding: var(--ht-space-1);
}

.step-header__text {
  display: flex;
  flex-direction: column;
}

.step-header__title {
  font-family: var(--ht-font-condensed);
  font-weight: 600;
  font-size: var(--ht-text-3);
}

.step-header__subtitle {
  font-size: var(--ht-text-1);
  color: var(--ht-ink-muted);
}
</style>
