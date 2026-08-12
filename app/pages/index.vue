<script setup lang="ts">
// Public catalog browse (FR-02, FR-03, D-08, D-38, W1, P2 §7; issue
// #76/IR-08, S-01). No login, no cookie, no tracking — a Visitor is
// deliberately not a tracked identity. Fetches /api/public/asset-types
// (unauthenticated, published AssetTypes only) and, per selected date
// range, /api/public/asset-types/:id/availability — also unauthenticated,
// no record written.
//
// Shown per AssetType: the MINIMUM of the per-day counts across the
// selected range, not any single day's number — booking the whole range
// requires every day in it to have at least one unit free, so the
// minimum is the number that actually answers "can I book this."
//
// UIF-04: one availability request per AssetType per date change, not
// batched. Left as-is deliberately for the pilot's own catalog size
// (~200 Assets across a handful of AssetTypes, NFR-04) — a batched
// endpoint is a real server-side addition, not a restyle, and the
// current fan-out has not shown up as a problem at this scale.
import { sk } from '~/i18n/sk'
import type { DraftReservationLine } from '~/composables/useReservationDraft'
import { todayInBratislava } from '~/utils/format'

definePageMeta({ layout: 'public' })

interface AssetTypeView {
  id: number
  name: string
  description: string
  dayRate: { amount: number; currency: string }
  depositAmount: { amount: number; currency: string }
}

interface AvailabilityState {
  status: 'loading' | 'loaded' | 'error'
  minAvailable: number | null
}

const { lines: draftLines, addLine, removeLine } = useReservationDraft()
const quantityInputs = reactive<Record<number, string>>({})

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

// UIF-01: was `new Date().toISOString()` (UTC) — silently defaulted to
// yesterday's inventory between 00:00 and ~02:00 Bratislava time.
const startDay = ref(todayInBratislava())
const endDay = ref(addDays(startDay.value, 2))

const { data: assetTypes } = await useFetch<AssetTypeView[]>('/api/public/asset-types')

const availability = reactive<Record<number, AvailabilityState>>({})

async function loadAvailability() {
  for (const assetType of assetTypes.value ?? []) {
    availability[assetType.id] = { status: 'loading', minAvailable: null }
  }

  await Promise.all(
    (assetTypes.value ?? []).map(async (assetType) => {
      try {
        const result = await $fetch<{ days: { day: string; available: number }[] }>(
          `/api/public/asset-types/${assetType.id}/availability`,
          { query: { startDay: startDay.value, endDay: endDay.value } },
        )
        const minAvailable = result.days.reduce((min, d) => Math.min(min, d.available), Infinity)
        availability[assetType.id] = { status: 'loaded', minAvailable: Number.isFinite(minAvailable) ? minAvailable : 0 }
      } catch {
        availability[assetType.id] = { status: 'error', minAvailable: null }
      }
    }),
  )
}

watch([startDay, endDay, assetTypes], loadAvailability, { immediate: true })

function addToReservation(assetType: AssetTypeView) {
  const quantity = Number(quantityInputs[assetType.id] ?? '1')
  const minAvailable = availability[assetType.id]?.minAvailable ?? 0
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > minAvailable) return

  addLine({
    assetTypeId: assetType.id,
    assetTypeName: assetType.name,
    dayRate: assetType.dayRate,
    depositAmount: assetType.depositAmount,
    period: { startDay: startDay.value, endDay: endDay.value },
    quantity,
  })
  quantityInputs[assetType.id] = '1'
}

function draftLineTotal(line: DraftReservationLine): { amount: number; currency: string } {
  return { amount: line.dayRate.amount * line.quantity, currency: line.dayRate.currency }
}
</script>

<template>
  <main class="catalog">
    <h1>{{ sk.publicCatalog.title }}</h1>

    <form class="catalog__range" @submit.prevent>
      <AppField :label="sk.publicCatalog.fromLabel">
        <template #default="slotProps">
          <input :id="slotProps.id" v-model="startDay" type="date" />
        </template>
      </AppField>
      <AppField :label="sk.publicCatalog.toLabel">
        <template #default="slotProps">
          <input :id="slotProps.id" v-model="endDay" type="date" :min="startDay" />
        </template>
      </AppField>
    </form>

    <EmptyState v-if="assetTypes && assetTypes.length === 0" :message="sk.publicCatalog.empty" />

    <div class="catalog__grid">
      <article v-for="assetType in assetTypes" :key="assetType.id" class="catalog__card">
        <h2>{{ assetType.name }}</h2>
        <p class="catalog__description">{{ assetType.description }}</p>

        <div class="catalog__prices">
          <div>
            <span class="catalog__price-label">{{ sk.publicCatalog.dayRateLabel }}</span>
            <MoneyAmount :amount="assetType.dayRate" />
          </div>
          <div>
            <span class="catalog__price-label">{{ sk.publicCatalog.depositLabel }}</span>
            <MoneyAmount :amount="assetType.depositAmount" />
          </div>
        </div>

        <p v-if="availability[assetType.id]?.status === 'loading'">{{ sk.publicCatalog.availabilityLoading }}</p>
        <AppAlert v-else-if="availability[assetType.id]?.status === 'error'" :message="sk.publicCatalog.availabilityError" />
        <p v-else-if="availability[assetType.id]?.minAvailable === 0">{{ sk.publicCatalog.availabilityNone }}</p>
        <p v-else-if="availability[assetType.id]?.minAvailable != null">
          {{ sk.publicCatalog.availabilityAvailable.replace('{count}', String(availability[assetType.id]?.minAvailable)) }}
        </p>

        <div v-if="(availability[assetType.id]?.minAvailable ?? 0) > 0" class="catalog__add">
          <AppField :label="sk.publicCatalog.quantityLabel">
            <template #default="slotProps">
              <input
                :id="slotProps.id"
                v-model="quantityInputs[assetType.id]"
                type="number"
                min="1"
                :max="availability[assetType.id]?.minAvailable"
                step="1"
              />
            </template>
          </AppField>
          <AppButton variant="primary" @click="addToReservation(assetType)">
            {{ sk.publicCatalog.addToReservationAction }}
          </AppButton>
        </div>
      </article>
    </div>

    <section v-if="draftLines.length > 0" class="catalog__draft">
      <h2>{{ sk.publicCatalog.draftHeading }}</h2>
      <ul class="catalog__draft-list">
        <li v-for="(line, index) in draftLines" :key="`${line.assetTypeId}-${line.period.startDay}-${line.period.endDay}`">
          <span>{{ line.assetTypeName }} × {{ line.quantity }}</span>
          <DayRange :start-day="line.period.startDay" :end-day="line.period.endDay" />
          <MoneyAmount :amount="draftLineTotal(line)" />
          <AppButton variant="quiet" @click="removeLine(index)">{{ sk.publicCatalog.removeLineAction }}</AppButton>
        </li>
      </ul>
      <p>
        <NuxtLink to="/checkout">
          <AppButton variant="primary">{{ sk.publicCatalog.proceedToCheckoutAction }}</AppButton>
        </NuxtLink>
      </p>
    </section>
  </main>
</template>

<style scoped>
.catalog {
  max-width: 960px;
  margin: 0 auto;
  padding: var(--ht-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-5);
}

.catalog__range {
  display: flex;
  gap: var(--ht-space-4);
}

.catalog__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--ht-space-4);
}

.catalog__card {
  background: var(--ht-surface);
  border: 1px solid var(--ht-line);
  border-radius: var(--ht-radius-card);
  padding: var(--ht-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-2);
}

.catalog__description {
  color: var(--ht-ink-muted);
  font-size: var(--ht-text-2);
}

.catalog__prices {
  display: flex;
  gap: var(--ht-space-5);
}

.catalog__price-label {
  display: block;
  font-family: var(--ht-font-condensed);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: var(--ht-text-1);
  color: var(--ht-ink-muted);
}

.catalog__add {
  display: flex;
  align-items: flex-end;
  gap: var(--ht-space-3);
  margin-top: var(--ht-space-2);
}

.catalog__draft-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-2);
}

.catalog__draft-list li {
  display: flex;
  align-items: center;
  gap: var(--ht-space-4);
  padding: var(--ht-space-2) 0;
  border-bottom: 1px solid var(--ht-line);
}
</style>
