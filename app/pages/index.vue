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

definePageMeta({ layout: 'public', hero: true })

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
  <main class="catalog-page">
    <PublicHero>
      <h1>{{ sk.publicCatalog.title }}</h1>
      <p class="catalog-page__lead">{{ sk.publicCatalog.lead }}</p>
    </PublicHero>

    <div class="catalog">
    <div v-if="classification" class="catalog__filters">
      <ClassificationFilter
        v-model="selection"
        :power-sources="classification.powerSources"
        :use-areas="classification.useAreas"
      />
    </div>

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
    </div>
  </main>
</template>

<style scoped>
.catalog-page {
  width: 100%;
}

.catalog-page__lead {
  max-width: 52ch;
  font-size: var(--ht-text-3);
}

/* Rises into the hero band, like every page that opens with one. */
.catalog {
  position: relative;
  width: 100%;
  box-sizing: border-box;
  max-width: 1200px;
  margin: calc(var(--ht-hero-overlap) * -1) auto 0;
  padding: 0 var(--ht-space-4) var(--ht-space-6);
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-5);
}

.catalog__filters {
  padding: var(--ht-space-4);
  border-radius: calc(var(--ht-radius-card) + var(--ht-space-1));
  background: var(--ht-surface);
  box-shadow: var(--ht-shadow-card);
}

.catalog__grid > li {
  display: flex;
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
