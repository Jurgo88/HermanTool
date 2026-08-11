<script setup lang="ts">
// Public catalog browse (FR-02, FR-03, D-08, D-38, W1, P2 §7; issue
// #76/IR-08). No login, no cookie, no tracking — a Visitor is
// deliberately not a tracked identity. Fetches /api/public/asset-types
// (unauthenticated, published AssetTypes only) and, per selected date
// range, /api/public/asset-types/:id/availability — also unauthenticated,
// no record written.
//
// Shown per AssetType: the MINIMUM of the per-day counts across the
// selected range, not any single day's number — booking the whole range
// requires every day in it to have at least one unit free, so the
// minimum is the number that actually answers "can I book this."
import { sk } from '~/i18n/sk'
import type { DraftReservationLine } from '~/composables/useReservationDraft'
import { formatDayRange, formatMoney } from '~/utils/format'

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

function toIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return toIsoDay(date)
}

const startDay = ref(toIsoDay(new Date()))
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

function draftLineTotal(line: DraftReservationLine): string {
  return formatMoney({ amount: line.dayRate.amount * line.quantity, currency: line.dayRate.currency })
}
</script>

<template>
  <main>
    <h1>{{ sk.publicCatalog.title }}</h1>

    <form @submit.prevent>
      <label>
        {{ sk.publicCatalog.fromLabel }}
        <input v-model="startDay" type="date" />
      </label>
      <label>
        {{ sk.publicCatalog.toLabel }}
        <input v-model="endDay" type="date" :min="startDay" />
      </label>
    </form>

    <ul>
      <li v-for="assetType in assetTypes" :key="assetType.id">
        <h2>{{ assetType.name }}</h2>
        <p>{{ assetType.description }}</p>
        <p>
          {{ formatMoney(assetType.dayRate) }} {{ sk.publicCatalog.dayRateSuffix }}
          {{ formatMoney(assetType.depositAmount) }}
        </p>
        <p v-if="availability[assetType.id]?.status === 'loading'">{{ sk.publicCatalog.availabilityLoading }}</p>
        <p v-else-if="availability[assetType.id]?.status === 'error'">{{ sk.publicCatalog.availabilityError }}</p>
        <p v-else-if="availability[assetType.id]?.minAvailable === 0">{{ sk.publicCatalog.availabilityNone }}</p>
        <p v-else-if="availability[assetType.id]?.minAvailable != null">
          {{ sk.publicCatalog.availabilityAvailable.replace('{count}', String(availability[assetType.id]?.minAvailable)) }}
        </p>
        <p v-if="(availability[assetType.id]?.minAvailable ?? 0) > 0">
          <label>
            {{ sk.publicCatalog.quantityLabel }}
            <input
              v-model="quantityInputs[assetType.id]"
              type="number"
              min="1"
              :max="availability[assetType.id]?.minAvailable"
              step="1"
            />
          </label>
          <button type="button" @click="addToReservation(assetType)">{{ sk.publicCatalog.addToReservationAction }}</button>
        </p>
      </li>
    </ul>
    <p v-if="assetTypes && assetTypes.length === 0">{{ sk.publicCatalog.empty }}</p>

    <section v-if="draftLines.length > 0">
      <h2>{{ sk.publicCatalog.draftHeading }}</h2>
      <table>
        <thead>
          <tr>
            <th>{{ sk.publicCatalog.columnAssetType }}</th>
            <th>{{ sk.publicCatalog.columnPeriod }}</th>
            <th>{{ sk.publicCatalog.columnQuantity }}</th>
            <th>{{ sk.publicCatalog.columnLineTotal }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(line, index) in draftLines" :key="`${line.assetTypeId}-${line.period.startDay}-${line.period.endDay}`">
            <td>{{ line.assetTypeName }}</td>
            <td>{{ formatDayRange(line.period.startDay, line.period.endDay) }}</td>
            <td>{{ line.quantity }}</td>
            <td>{{ draftLineTotal(line) }}</td>
            <td>
              <button type="button" @click="removeLine(index)">{{ sk.publicCatalog.removeLineAction }}</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        <NuxtLink to="/checkout">{{ sk.publicCatalog.proceedToCheckoutAction }}</NuxtLink>
      </p>
    </section>
  </main>
</template>
