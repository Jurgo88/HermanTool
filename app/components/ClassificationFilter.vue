<!-- C-22 (D-54; design foundation §5, S-01). Two groups of toggle chips,
  PowerSource and UseArea. Selection state is aria-pressed plus a filled
  versus outlined chip, never colour alone (§8). The OR/AND semantics live
  in app/utils/catalog-filter.ts, not here. -->
<script setup lang="ts">
import { sk } from '~/i18n/sk'
import { toggleId, type ClassificationSelection } from '~/utils/catalog-filter'

interface Option {
  id: number
  label: string
}

const props = defineProps<{
  powerSources: Option[]
  useAreas: Option[]
  modelValue: ClassificationSelection
}>()

const emit = defineEmits<{ 'update:modelValue': [value: ClassificationSelection] }>()

const hasSelection = computed(
  () => props.modelValue.powerSourceIds.length > 0 || props.modelValue.useAreaIds.length > 0,
)

function togglePower(id: number) {
  emit('update:modelValue', {
    ...props.modelValue,
    powerSourceIds: toggleId(props.modelValue.powerSourceIds, id),
  })
}

function toggleArea(id: number) {
  emit('update:modelValue', {
    ...props.modelValue,
    useAreaIds: toggleId(props.modelValue.useAreaIds, id),
  })
}

function clear() {
  emit('update:modelValue', { powerSourceIds: [], useAreaIds: [] })
}
</script>

<template>
  <section class="classification-filter" :aria-label="sk.publicCatalog.filterHeading">
    <h2 class="classification-filter__heading">{{ sk.publicCatalog.filterHeading }}</h2>

    <div v-if="powerSources.length > 0" class="classification-filter__row">
      <span id="classification-filter-power" class="classification-filter__group-label">{{
        sk.publicCatalog.powerSourceGroup
      }}</span>
      <div
        class="classification-filter__group"
        role="group"
        aria-labelledby="classification-filter-power"
      >
        <button
          v-for="option in powerSources"
          :key="option.id"
          type="button"
          class="classification-filter__chip"
          :aria-pressed="modelValue.powerSourceIds.includes(option.id)"
          @click="togglePower(option.id)"
        >
          {{ option.label }}
        </button>
      </div>
    </div>

    <div v-if="useAreas.length > 0" class="classification-filter__row">
      <span id="classification-filter-area" class="classification-filter__group-label">{{
        sk.publicCatalog.useAreaGroup
      }}</span>
      <div
        class="classification-filter__group"
        role="group"
        aria-labelledby="classification-filter-area"
      >
        <button
          v-for="option in useAreas"
          :key="option.id"
          type="button"
          class="classification-filter__chip"
          :aria-pressed="modelValue.useAreaIds.includes(option.id)"
          @click="toggleArea(option.id)"
        >
          {{ option.label }}
        </button>
      </div>
    </div>

    <AppButton v-if="hasSelection" variant="quiet" @click="clear">{{
      sk.publicCatalog.clearFilters
    }}</AppButton>
  </section>
</template>

<style scoped>
.classification-filter {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--ht-space-3);
}

.classification-filter__heading {
  font-size: var(--ht-text-3);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  text-align: center;
}

.classification-filter__row {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-1);
}

.classification-filter__group-label {
  font-family: var(--ht-font-condensed);
  font-weight: 600;
  font-size: var(--ht-text-1);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ht-ink-muted);
}

/* One swipeable line per group on a phone: the half-visible chip at the edge
 * says there is more, and the filter costs two lines, not five. */
.classification-filter__group {
  display: flex;
  gap: var(--ht-space-2);
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scroll-padding-inline: var(--ht-space-4);
  scrollbar-width: none;
  margin: 0 calc(var(--ht-space-4) * -1);
  padding: var(--ht-space-1) var(--ht-space-4);
}

.classification-filter__group::-webkit-scrollbar {
  display: none;
}

@media (min-width: 720px) {
  .classification-filter {
    align-items: center;
  }

  .classification-filter__row {
    align-items: center;
  }

  .classification-filter__group {
    flex-wrap: wrap;
    justify-content: center;
    overflow-x: visible;
    margin: 0;
    padding: 0;
  }
}

.classification-filter__chip {
  flex: none;
  scroll-snap-align: start;
  min-height: var(--ht-hit-min);
  padding: 0 var(--ht-space-4);
  border: 2px solid var(--ht-brand);
  border-radius: var(--ht-radius-card);
  background: var(--ht-surface);
  color: var(--ht-brand-deep);
  font-family: var(--ht-font-condensed);
  font-weight: 600;
  font-size: var(--ht-text-2);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: background var(--ht-motion) ease-out;
}

.classification-filter__chip[aria-pressed='true'] {
  background: var(--ht-brand);
  color: var(--ht-on-brand);
}

.classification-filter__chip:focus-visible {
  outline: 3px solid var(--ht-signal-deep);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .classification-filter__chip {
    transition: none;
  }
}
</style>
