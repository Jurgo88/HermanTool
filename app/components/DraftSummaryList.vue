<!-- C-28 (S-04, S-05). The tools of a reservation draft as a short list:
  photo, name, days and units, an Accessory under its principal (D-57).
  Shows only what the draft holds; it computes nothing (D-51). -->
<script setup lang="ts">
import { sk } from '~/i18n/sk'
import type { DraftReservationLine } from '~/composables/useReservationDraft'
import { orderForDisplay } from '~/utils/reservation-draft'

const props = defineProps<{ lines: DraftReservationLine[] }>()
const entries = computed(() => orderForDisplay(props.lines))
</script>

<template>
  <ul class="draft-summary">
    <li
      v-for="{ line, isAccessory } in entries"
      :key="`${line.assetTypeId}-${line.period.startDay}-${line.period.endDay}`"
      class="draft-summary__line"
      :class="{ 'draft-summary__line--accessory': isAccessory }"
    >
      <span class="draft-summary__thumb" aria-hidden="true">
        <img
          v-if="line.imageFile"
          :src="`/catalog/${line.imageFile}`"
          alt=""
          width="96"
          height="96"
        />
      </span>
      <span class="draft-summary__text">
        <span class="draft-summary__name">{{ line.assetTypeName }}</span>
        <span class="draft-summary__meta">
          <DayRange :start-day="line.period.startDay" :end-day="line.period.endDay" />
          · {{ sk.checkout.unitCount.replace('{count}', String(line.quantity)) }}
        </span>
      </span>
    </li>
  </ul>
</template>

<style scoped>
.draft-summary {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.draft-summary__line {
  display: flex;
  align-items: center;
  gap: var(--ht-space-3);
  padding: var(--ht-space-2) 0;
  text-align: left;
}

.draft-summary__line + .draft-summary__line {
  border-top: 1px solid var(--ht-line);
}

.draft-summary__line--accessory {
  padding-left: var(--ht-space-5);
}

.draft-summary__thumb {
  flex: none;
  width: var(--ht-space-7);
  height: var(--ht-space-7);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--ht-space-1);
  border-radius: var(--ht-radius-tile);
  background: var(--ht-paper);
}

.draft-summary__thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.draft-summary__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.draft-summary__name {
  font-weight: 600;
}

.draft-summary__meta {
  font-size: var(--ht-text-2);
  color: var(--ht-ink-muted);
}
</style>
