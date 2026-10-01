<script setup lang="ts">
// S-01 catalog browse (FR-01, FR-02, D-54, D-57, D-58, W1; issue #156).
// No login, no cookie, no tracking — a Visitor is deliberately not a
// tracked identity (P2 §7). Browsed without dates: availability lives on
// the S-02 detail (D-58), which also closes UIF-04's per-card fan-out.
// The public list never contains an Accessory (D-57); the server already
// leaves them out.
import { sk } from '~/i18n/sk'
import { matchesSelection, type ClassificationSelection } from '~/utils/catalog-filter'
import type { MonetaryAmountView } from '~/utils/format'

definePageMeta({ layout: 'public' })

interface AssetTypeView {
  id: number
  name: string
  dayRate: MonetaryAmountView
  powerSourceId: number | null
  useAreaIds: number[]
  imageFile: string | null
}

interface ClassificationView {
  powerSources: { id: number; label: string }[]
  useAreas: { id: number; label: string }[]
}

const {
  data: assetTypes,
  status: assetTypesStatus,
  refresh,
} = await useFetch<AssetTypeView[]>('/api/public/asset-types')
const { data: classification } = await useFetch<ClassificationView>(
  '/api/public/catalog-classification',
)

const selection = ref<ClassificationSelection>({ powerSourceIds: [], useAreaIds: [] })

const visible = computed(() =>
  (assetTypes.value ?? []).filter((assetType) => matchesSelection(assetType, selection.value)),
)

function clearSelection() {
  selection.value = { powerSourceIds: [], useAreaIds: [] }
}
</script>

<template>
  <main class="catalog">
    <h1 class="catalog__title">{{ sk.publicCatalog.title }}</h1>

    <ClassificationFilter
      v-if="classification"
      v-model="selection"
      :power-sources="classification.powerSources"
      :use-areas="classification.useAreas"
    />

    <p v-if="assetTypesStatus === 'pending'" aria-busy="true">{{ sk.publicCatalog.loading }}</p>
    <AppAlert v-else-if="assetTypesStatus === 'error'" :message="sk.publicCatalog.loadError" />
    <EmptyState
      v-else-if="assetTypes && assetTypes.length === 0"
      :message="sk.publicCatalog.empty"
    />
    <EmptyState v-else-if="visible.length === 0" :message="sk.publicCatalog.noMatch">
      <AppButton variant="secondary" @click="clearSelection">{{
        sk.publicCatalog.clearFilters
      }}</AppButton>
    </EmptyState>

    <ul v-else class="catalog__grid">
      <li v-for="assetType in visible" :key="assetType.id">
        <AssetTypeCard
          :asset-type-id="assetType.id"
          :name="assetType.name"
          :day-rate="assetType.dayRate"
          :image-file="assetType.imageFile"
        />
      </li>
    </ul>

    <AppButton v-if="assetTypesStatus === 'error'" variant="secondary" @click="refresh()">
      {{ sk.publicCatalog.retryAction }}
    </AppButton>
  </main>
</template>

<style scoped>
.catalog {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--ht-space-5) var(--ht-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-5);
}

.catalog__title {
  text-align: center;
}

.catalog__grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ht-space-3);
}

@media (min-width: 720px) {
  .catalog__grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--ht-space-4);
  }
}

@media (min-width: 1024px) {
  .catalog__grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
</style>
