<!-- S-02 „Hodí sa k tomu“ (D-62; issue #210). Standalone AssetTypes the
  Operator linked as compatible with this one: a suggestion, never a
  requirement. Each can be added on the same RentalPeriod in one click.
  When one is not free for that period, the nearest periods in which both
  are come from the server (Availability & Reservation does the date
  arithmetic, D-12) and the Visitor may move the whole selection there;
  adding it on a different period is not offered. Nothing here counts
  days or units: availability and suggestions are server reads, advisory
  until D-33's hold at checkout. -->
<script setup lang="ts">
import { sk } from '~/i18n/sk'
import { formatMoney, type MonetaryAmountView } from '~/utils/format'

export interface CompatibleAssetTypeView {
  id: number
  name: string
  dayRate: MonetaryAmountView
  depositAmount: MonetaryAmountView
  imageFile: string | null
}

interface Period {
  startDay: string
  endDay: string
}

const props = defineProps<{
  assetTypeId: number
  suggestions: CompatibleAssetTypeView[]
  startDay: string | null
  endDay: string | null
  quantity: number
}>()

const emit = defineEmits<{
  add: [entry: CompatibleAssetTypeView, period: Period]
  'move-period': [period: Period]
}>()

type ItemState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available' }
  | { status: 'unavailable'; periods: Period[] }
  | { status: 'added' }
  | { status: 'error' }

const states = ref<Record<number, ItemState>>({})
let generation = 0

async function isFree(id: number, period: Period): Promise<boolean> {
  const result = await $fetch<{ days: { available: number }[] }>(
    `/api/public/asset-types/${id}/availability`,
    { query: period },
  )
  return result.days.every((day) => day.available >= 1)
}

async function checkItem(entry: CompatibleAssetTypeView, period: Period, run: number) {
  states.value[entry.id] = { status: 'checking' }
  try {
    if (await isFree(entry.id, period)) {
      if (run === generation) states.value[entry.id] = { status: 'available' }
      return
    }
    const { periods } = await $fetch<{ periods: Period[] }>(
      `/api/public/asset-types/${props.assetTypeId}/nearest-joint-periods`,
      { query: { compatibleId: entry.id, ...period, quantity: props.quantity } },
    )
    if (run === generation) states.value[entry.id] = { status: 'unavailable', periods }
  } catch {
    if (run === generation) states.value[entry.id] = { status: 'error' }
  }
}

function checkAll() {
  const run = ++generation
  if (!props.startDay || !props.endDay) {
    states.value = Object.fromEntries(
      props.suggestions.map((entry) => [entry.id, { status: 'idle' }]),
    )
    return
  }
  const period = { startDay: props.startDay, endDay: props.endDay }
  for (const entry of props.suggestions) checkItem(entry, period, run)
}

watch(() => [props.startDay, props.endDay, props.quantity], checkAll, { immediate: true })

const stateOf = (id: number): ItemState => states.value[id] ?? { status: 'idle' }

function add(entry: CompatibleAssetTypeView) {
  if (!props.startDay || !props.endDay || stateOf(entry.id).status !== 'available') return
  emit('add', entry, { startDay: props.startDay, endDay: props.endDay })
  states.value[entry.id] = { status: 'added' }
}

function retry(entry: CompatibleAssetTypeView) {
  if (!props.startDay || !props.endDay) return
  checkItem(entry, { startDay: props.startDay, endDay: props.endDay }, generation)
}
</script>

<template>
  <section
    v-if="suggestions.length > 0"
    class="compatible"
    aria-labelledby="compatible-asset-types-heading"
  >
    <h2 id="compatible-asset-types-heading" class="compatible__heading">
      {{ sk.assetTypeDetail.compatibleHeading }}
    </h2>
    <p class="compatible__lead">{{ sk.assetTypeDetail.compatibleLead }}</p>
    <ul class="compatible__list">
      <li v-for="entry in suggestions" :key="entry.id" class="compatible__entry">
        <NuxtLink :to="`/naradie/${entry.id}`" class="compatible__link">
          <span class="compatible__thumb" aria-hidden="true">
            <img
              v-if="entry.imageFile"
              :src="`/catalog/${entry.imageFile}`"
              alt=""
              width="96"
              height="96"
            />
          </span>
          <span class="compatible__text">
            <span class="compatible__name">{{ entry.name }}</span>
            <span class="compatible__meta">
              {{ sk.assetTypeDetail.rateChip.replace('{amount}', formatMoney(entry.dayRate)) }}
            </span>
          </span>
        </NuxtLink>

        <div class="compatible__action">
          <template v-if="stateOf(entry.id).status === 'added'">
            <p class="compatible__added" role="status">
              {{ sk.assetTypeDetail.compatibleAdded }}
            </p>
          </template>
          <template v-else>
            <AppButton
              variant="secondary"
              :pending="stateOf(entry.id).status === 'checking'"
              :disabled="stateOf(entry.id).status !== 'available'"
              @click="add(entry)"
            >
              {{ sk.assetTypeDetail.compatibleAddAction }}
            </AppButton>
            <small v-if="stateOf(entry.id).status === 'idle'" class="compatible__reason">
              {{ sk.assetTypeDetail.accessoryPickPeriodFirst }}
            </small>
            <small
              v-else-if="stateOf(entry.id).status === 'checking'"
              class="compatible__reason"
              aria-busy="true"
            >
              {{ sk.assetTypeDetail.rangeChecking }}
            </small>
            <div v-else-if="stateOf(entry.id).status === 'error'" class="compatible__reason">
              <AppAlert :message="sk.assetTypeDetail.rangeError" />
              <AppButton variant="quiet" @click="retry(entry)">
                {{ sk.assetTypeDetail.compatibleRetry }}
              </AppButton>
            </div>
          </template>
        </div>

        <div
          v-if="stateOf(entry.id).status === 'unavailable'"
          class="compatible__suggestions"
          role="status"
        >
          <p class="compatible__reason">{{ sk.assetTypeDetail.compatibleUnavailable }}</p>
          <template v-if="(stateOf(entry.id) as { periods: Period[] }).periods.length > 0">
            <p class="compatible__reason">{{ sk.assetTypeDetail.compatibleSuggestionsLead }}</p>
            <ul class="compatible__periods">
              <li
                v-for="period in (stateOf(entry.id) as { periods: Period[] }).periods"
                :key="period.startDay"
              >
                <AppButton variant="quiet" @click="emit('move-period', period)">
                  <DayRange :start-day="period.startDay" :end-day="period.endDay" />
                </AppButton>
              </li>
            </ul>
            <p class="compatible__note">{{ sk.assetTypeDetail.compatibleMoveNote }}</p>
          </template>
          <p v-else class="compatible__reason">{{ sk.assetTypeDetail.compatibleNoSuggestions }}</p>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.compatible {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-2);
  padding: var(--ht-space-4);
  background: var(--ht-surface);
  border: var(--ht-line-width) solid var(--ht-line);
  border-radius: var(--ht-radius-card);
}

.compatible__heading {
  margin: 0;
  font-size: var(--ht-text-3);
}

.compatible__lead,
.compatible__note {
  margin: 0;
  color: var(--ht-ink-muted);
  font-size: var(--ht-text-1);
}

.compatible__list,
.compatible__periods {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-3);
}

.compatible__periods {
  flex-direction: row;
  flex-wrap: wrap;
  gap: var(--ht-space-2);
}

.compatible__entry {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-2);
  padding-top: var(--ht-space-3);
  border-top: var(--ht-line-width) solid var(--ht-line);
}

.compatible__link {
  display: flex;
  align-suggestions: center;
  gap: var(--ht-space-3);
  color: inherit;
  text-decoration: none;
}

.compatible__link:focus-visible {
  outline: var(--ht-focus-ring-width) solid var(--ht-brand);
  outline-offset: var(--ht-focus-ring-offset);
}

.compatible__thumb {
  flex: none;
  width: var(--ht-hit-counter);
  height: var(--ht-hit-counter);
  border-radius: var(--ht-radius-tile);
  background: var(--ht-surface-sunk);
  overflow: hidden;
}

.compatible__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.compatible__text {
  display: flex;
  flex-direction: column;
}

.compatible__name {
  font-weight: 600;
}

.compatible__meta,
.compatible__reason {
  color: var(--ht-ink-muted);
  font-size: var(--ht-text-1);
}

.compatible__reason {
  margin: 0;
}

.compatible__action {
  display: flex;
  flex-direction: column;
  align-suggestions: flex-start;
  gap: var(--ht-space-1);
}

.compatible__added {
  margin: 0;
  color: var(--ht-ok);
  font-weight: 600;
}

.compatible__suggestions {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-2);
}
</style>
