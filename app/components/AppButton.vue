<!-- C-01 (D-43; docs/design/interface-design-foundation.md §5). Owns
  pending state and disabled reasoning: pass `pending`, the button
  disables itself and marks aria-busy — callers no longer need their own
  `:disabled="submitting"`. Slot content is the caller's job (including
  swapping label text while pending, e.g. "Vydávam…"); this component
  never invents copy (D-20). -->
<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'danger' | 'quiet'
    size?: 'default' | 'counter'
    type?: 'button' | 'submit'
    disabled?: boolean
    pending?: boolean
  }>(),
  { variant: 'primary', size: 'default', type: 'button', disabled: false, pending: false },
)
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || pending"
    :aria-busy="pending"
    :class="['app-button', `app-button--${variant}`, `app-button--${size}`]"
  >
    <slot />
  </button>
</template>

<style scoped>
.app-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--ht-button-radius);
  font-family: var(--ht-button-font);
  font-weight: var(--ht-button-weight);
  text-transform: var(--ht-button-case);
  letter-spacing: var(--ht-button-tracking);
  font-size: var(--ht-text-2);
  transition:
    transform var(--ht-motion),
    box-shadow var(--ht-motion);
  padding: 0 var(--ht-space-4);
  height: var(--ht-hit-min);
  cursor: pointer;
}

.app-button--counter {
  height: var(--ht-hit-counter);
  font-size: var(--ht-text-3);
}

.app-button--primary {
  background: var(--ht-button-primary-bg);
  color: var(--ht-on-signal);
  box-shadow: var(--ht-button-primary-shadow);
}

.app-button--primary:not(:disabled):active {
  transform: translateY(1px);
}

.app-button--secondary {
  background: transparent;
  color: var(--ht-ink);
  border: 1px solid var(--ht-line-strong);
}

.app-button--danger {
  background: var(--ht-danger);
  color: #fff;
}

.app-button--quiet {
  background: transparent;
  color: var(--ht-ink-muted);
  text-transform: none;
  letter-spacing: normal;
  font-family: var(--ht-font-sans);
  font-weight: 500;
}

.app-button:disabled {
  box-shadow: none;
  background: var(--ht-surface-sunk);
  color: var(--ht-ink-muted);
  border: 1px solid var(--ht-line);
  cursor: not-allowed;
}
</style>
