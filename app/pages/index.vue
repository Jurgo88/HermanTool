<script setup lang="ts">
// Public catalog browse (FR-02, W1, P2 §7). No login, no cookie, no
// tracking — a Visitor is deliberately not a tracked identity. Fetches
// /api/public/asset-types, which is itself unauthenticated and only
// ever returns published AssetTypes.
//
// No availability shown yet: it belongs to Availability & Reservation
// (Milestone 4), not built yet — see issue #11's own scope note. This
// page is the read surface; the per-day numbers arrive later.
interface AssetTypeView {
  id: number
  name: string
  description: string
  dayRate: { amount: number; currency: string }
  depositAmount: { amount: number; currency: string }
}

function toEuros(minorUnits: number): string {
  return (minorUnits / 100).toFixed(2)
}

const { data: assetTypes } = await useFetch<AssetTypeView[]>('/api/public/asset-types')
</script>

<template>
  <main>
    <h1>HermanTool</h1>
    <ul>
      <li v-for="assetType in assetTypes" :key="assetType.id">
        <h2>{{ assetType.name }}</h2>
        <p>{{ assetType.description }}</p>
        <p>
          {{ toEuros(assetType.dayRate.amount) }} {{ assetType.dayRate.currency }} / deň, depozit
          {{ toEuros(assetType.depositAmount.amount) }} {{ assetType.depositAmount.currency }}
        </p>
      </li>
    </ul>
    <p v-if="assetTypes && assetTypes.length === 0">Zatiaľ nie je publikované žiadne náradie.</p>
  </main>
</template>
