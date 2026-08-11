<!-- C-02 (D-43; docs/design/interface-design-foundation.md §5, §8). Label
  + control + hint + error, always <label>-bound, aria-describedby wired
  — the accessibility floor's "placeholder is never the label" and "every
  control has a programmatic label" made structural. The control itself
  is the default slot, bound via the scoped slot props (`id`,
  `ariaDescribedby`) so this stays input-type-agnostic. -->
<script setup lang="ts">
const props = defineProps<{
  label: string
  hint?: string | null
  error?: string | null
}>()

const fieldId = useId()
const hintId = computed(() => (props.hint ? `${fieldId}-hint` : undefined))
const errorId = computed(() => (props.error ? `${fieldId}-error` : undefined))
const describedBy = computed(() => [hintId.value, errorId.value].filter(Boolean).join(' ') || undefined)
</script>

<template>
  <div class="app-field">
    <label :for="fieldId" class="app-field__label">{{ label }}</label>
    <slot :id="fieldId" :aria-describedby="describedBy" />
    <p v-if="hint" :id="hintId" class="app-field__hint">{{ hint }}</p>
    <p v-if="error" :id="errorId" class="app-field__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.app-field {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-1);
  margin-bottom: var(--ht-space-4);
}

.app-field__label {
  font-family: var(--ht-font-condensed);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: var(--ht-text-1);
  color: var(--ht-ink-muted);
}

.app-field__hint {
  margin: 0;
  font-size: var(--ht-text-1);
  color: var(--ht-ink-muted);
}

.app-field__error {
  margin: 0;
  font-size: var(--ht-text-1);
  color: var(--ht-danger);
}
</style>
