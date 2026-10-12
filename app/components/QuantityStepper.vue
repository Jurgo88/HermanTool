<!-- C-26 (D-43, S-02). A whole number with − and + buttons that meet the
  hit target on a phone; the field stays typeable. Bounded by min and max. -->
<script setup lang="ts">
import { sk } from '~/i18n/sk'

const props = withDefaults(
  defineProps<{
    id?: string
    min?: number
    max?: number
    decreaseLabel: string
    increaseLabel: string
    ariaDescribedby?: string
  }>(),
  { id: undefined, min: 1, max: 50, ariaDescribedby: undefined },
)

const model = defineModel<number>({ required: true })

function clamp(value: number): number {
  if (!Number.isFinite(value)) return props.min
  return Math.min(props.max, Math.max(props.min, Math.round(value)))
}

function step(by: number) {
  model.value = clamp(model.value + by)
}

function onInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value
  if (raw === '') return
  model.value = clamp(Number(raw))
}
</script>

<template>
  <div class="quantity-stepper">
    <button
      type="button"
      class="quantity-stepper__button"
      :aria-label="decreaseLabel"
      :disabled="model <= min"
      @click="step(-1)"
    >
      <span aria-hidden="true">{{ sk.quantityStepper.decreaseGlyph }}</span>
    </button>
    <input
      :id="id"
      class="quantity-stepper__input"
      type="number"
      inputmode="numeric"
      :min="min"
      :max="max"
      step="1"
      :value="model"
      :aria-describedby="ariaDescribedby"
      @input="onInput"
      @blur="model = clamp(model)"
    />
    <button
      type="button"
      class="quantity-stepper__button"
      :aria-label="increaseLabel"
      :disabled="model >= max"
      @click="step(1)"
    >
      <span aria-hidden="true">{{ sk.quantityStepper.increaseGlyph }}</span>
    </button>
  </div>
</template>

<style scoped>
.quantity-stepper {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: var(--ht-space-1);
  padding: var(--ht-space-1);
  border-radius: var(--ht-radius-pill);
  background: var(--ht-surface-sunk);
}

.quantity-stepper__button {
  min-width: var(--ht-hit-min);
  min-height: var(--ht-hit-min);
  border: 0;
  border-radius: var(--ht-radius-pill);
  background: var(--ht-brand);
  color: var(--ht-on-brand);
  font-size: var(--ht-text-4);
  font-weight: 600;
  cursor: pointer;
}

.quantity-stepper__button:disabled {
  background: var(--ht-surface);
  color: var(--ht-line-strong);
  cursor: default;
}

.quantity-stepper__button:focus-visible,
.quantity-stepper__input:focus-visible {
  outline: 3px solid var(--ht-signal-deep);
  outline-offset: 2px;
}

.quantity-stepper__input {
  width: calc(var(--ht-space-7) + var(--ht-space-2));
  min-height: var(--ht-hit-min);
  border: 0;
  border-radius: 0;
  background: transparent;
  text-align: center;
  font-family: var(--ht-font-money);
  font-size: var(--ht-text-3);
  font-weight: 600;
  appearance: textfield;
}

.quantity-stepper__input::-webkit-inner-spin-button,
.quantity-stepper__input::-webkit-outer-spin-button {
  appearance: none;
  margin: 0;
}
</style>
