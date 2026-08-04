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

function toEuros(minorUnits: number): string {
  return (minorUnits / 100).toFixed(2)
}

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
          {{ toEuros(assetType.dayRate.amount) }} {{ assetType.dayRate.currency }} {{ sk.publicCatalog.dayRateSuffix }}
          {{ toEuros(assetType.depositAmount.amount) }} {{ assetType.depositAmount.currency }}
        </p>
        <p v-if="availability[assetType.id]?.status === 'loading'">{{ sk.publicCatalog.availabilityLoading }}</p>
        <p v-else-if="availability[assetType.id]?.status === 'error'">{{ sk.publicCatalog.availabilityError }}</p>
        <p v-else-if="availability[assetType.id]?.minAvailable === 0">{{ sk.publicCatalog.availabilityNone }}</p>
        <p v-else-if="availability[assetType.id]?.minAvailable != null">
          {{ sk.publicCatalog.availabilityAvailable.replace('{count}', String(availability[assetType.id]?.minAvailable)) }}
        </p>
      </li>
    </ul>
    <p v-if="assetTypes && assetTypes.length === 0">{{ sk.publicCatalog.empty }}</p>
  </main>
</template>
