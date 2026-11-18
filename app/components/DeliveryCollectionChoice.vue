<!-- S-03 Dovoz a odvoz (D-66; issue #217). Delivery and Collection are
  independent choices. Inside the DeliveryZone the Customer picks a
  municipality and types the street — the flat fee comes from the server.
  Outside it, „Chcem dovoz mimo zóny — zavolajte mi“ plus the place: the
  reservation completes as usual and the price is agreed by phone. This
  component computes no fee; it only shapes the request (D-25). -->
<script setup lang="ts">
import { sk } from '~/i18n/sk'
import { formatMoney, type MonetaryAmountView } from '~/utils/format'

export interface DeliveryRequestView {
  leg: 'delivery' | 'collection'
  timeWindow: 'morning' | 'afternoon'
  outsideZone: boolean
  municipalityId: number | null
  address: string
}

export interface DeliveryZoneView {
  offered: boolean
  flatFee: MonetaryAmountView | null
  municipalities: { id: number; name: string }[]
}

const props = defineProps<{
  zone: DeliveryZoneView
  modelValue: DeliveryRequestView[]
  disabled?: boolean
  showErrors?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: DeliveryRequestView[]] }>()

const legs = ['delivery', 'collection'] as const

const requestOf = (leg: DeliveryRequestView['leg']) => props.modelValue.find((r) => r.leg === leg)

function toggle(leg: DeliveryRequestView['leg'], on: boolean) {
  const rest = props.modelValue.filter((r) => r.leg !== leg)
  emit(
    'update:modelValue',
    on
      ? [
          ...rest,
          { leg, timeWindow: 'morning', outsideZone: false, municipalityId: null, address: '' },
        ]
      : rest,
  )
}

function update(leg: DeliveryRequestView['leg'], patch: Partial<DeliveryRequestView>) {
  emit(
    'update:modelValue',
    props.modelValue.map((r) => (r.leg === leg ? { ...r, ...patch } : r)),
  )
}

const incomplete = (r: DeliveryRequestView) =>
  !r.address.trim() || (!r.outsideZone && r.municipalityId === null)
</script>

<template>
  <section v-if="zone.offered" class="delivery-choice" aria-labelledby="delivery-choice-heading">
    <h3 id="delivery-choice-heading" class="delivery-choice__heading">
      {{ sk.deliveryChoice.heading }}
    </h3>
    <p v-if="zone.flatFee" class="delivery-choice__note">
      {{ sk.deliveryChoice.flatFeeNote.replaceAll('{amount}', formatMoney(zone.flatFee)) }}
    </p>

    <div v-for="leg in legs" :key="leg" class="delivery-choice__leg">
      <label class="delivery-choice__toggle">
        <input
          type="checkbox"
          :checked="!!requestOf(leg)"
          :disabled="disabled"
          @change="toggle(leg, ($event.target as HTMLInputElement).checked)"
        />
        <span>{{ sk.deliveryChoice.legs[leg] }}</span>
      </label>

      <fieldset v-if="requestOf(leg)" class="delivery-choice__details" :disabled="disabled">
        <legend class="delivery-choice__legend">{{ sk.deliveryChoice.legs[leg] }}</legend>
        <div
          class="delivery-choice__windows"
          role="radiogroup"
          :aria-label="sk.deliveryChoice.windowLabel"
        >
          <label v-for="window in ['morning', 'afternoon'] as const" :key="window">
            <input
              type="radio"
              :name="`delivery-window-${leg}`"
              :checked="requestOf(leg)!.timeWindow === window"
              @change="update(leg, { timeWindow: window })"
            />
            {{ sk.deliveryChoice.windows[window] }}
          </label>
        </div>

        <label class="delivery-choice__toggle">
          <input
            type="checkbox"
            :checked="requestOf(leg)!.outsideZone"
            @change="
              update(leg, {
                outsideZone: ($event.target as HTMLInputElement).checked,
                municipalityId: null,
              })
            "
          />
          <span>{{ sk.deliveryChoice.outsideZoneLabel }}</span>
        </label>

        <AppField v-if="!requestOf(leg)!.outsideZone" :label="sk.deliveryChoice.municipalityLabel">
          <template #default="slotProps">
            <select
              :id="slotProps.id"
              :value="requestOf(leg)!.municipalityId ?? ''"
              @change="
                update(leg, {
                  municipalityId: Number(($event.target as HTMLSelectElement).value) || null,
                })
              "
            >
              <option value="">{{ sk.deliveryChoice.municipalityPlaceholder }}</option>
              <option v-for="m in zone.municipalities" :key="m.id" :value="m.id">
                {{ m.name }}
              </option>
            </select>
          </template>
        </AppField>
        <AppField
          :label="
            requestOf(leg)!.outsideZone
              ? sk.deliveryChoice.placeLabel
              : sk.deliveryChoice.streetLabel
          "
          :hint="requestOf(leg)!.outsideZone ? sk.deliveryChoice.outsideZoneHint : null"
          :error="
            showErrors && incomplete(requestOf(leg)!) ? sk.deliveryChoice.incompleteError : null
          "
        >
          <template #default="slotProps">
            <input
              :id="slotProps.id"
              type="text"
              autocomplete="street-address"
              maxlength="300"
              :value="requestOf(leg)!.address"
              :aria-describedby="slotProps.ariaDescribedby"
              @input="update(leg, { address: ($event.target as HTMLInputElement).value })"
            />
          </template>
        </AppField>
      </fieldset>
    </div>
  </section>
</template>

<style scoped>
.delivery-choice {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-3);
}

.delivery-choice__heading {
  margin: 0;
  font-size: var(--ht-text-3);
}

.delivery-choice__note {
  margin: 0;
  color: var(--ht-ink-muted);
  font-size: var(--ht-text-2);
}

.delivery-choice__leg {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-2);
}

.delivery-choice__toggle {
  display: flex;
  align-items: center;
  gap: var(--ht-space-2);
  min-height: var(--ht-hit-min);
}

.delivery-choice__details {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-2);
  margin: 0;
  padding: var(--ht-space-3);
  border: var(--ht-line-width) solid var(--ht-line);
  border-radius: var(--ht-radius-tile);
}

.delivery-choice__legend {
  font-weight: 600;
  padding: 0 var(--ht-space-1);
}

.delivery-choice__windows {
  display: flex;
  gap: var(--ht-space-4);
}

.delivery-choice__windows label {
  display: inline-flex;
  align-items: center;
  gap: var(--ht-space-1);
  min-height: var(--ht-hit-min);
}
</style>
