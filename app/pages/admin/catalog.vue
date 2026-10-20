<script setup lang="ts">
// Catalog admin surface (FR-01, FR-37, S-19; A-09: low-frequency, distinct
// from the counter interaction). Every request goes through the Nitro
// routes under server/api/catalog/asset-types/*, which gate on
// requireOperator — a 401 here means the session is missing or expired,
// so this page sends the Operator back to /login rather than showing an
// error.
//
// Three tabs (owner review, 20 October 2026): the tools as a searchable
// list, edited in a side panel (C-29); every day rate and deposit in one
// table saved together (OQ #29: the imported prices are placeholders); and
// the catalog filters (D-54). Unpublish lives in the panel and goes through
// ConfirmAction (C-19): taking away something a Visitor may be looking at
// deserves a confirmation; publish does not.
import { sk } from '~/i18n/sk'
import { formatMoney } from '~/utils/format'
import { loginLocation } from '~/utils/operator-redirect'
import { getErrorCode } from '~/utils/error-code'
import type { EditableAssetType } from '~/components/AssetTypeEditor.vue'

definePageMeta({ layout: 'admin' })

interface AssetTypeView extends EditableAssetType {
  published: boolean
}

interface Entry {
  id: number
  label: string
}

// useNuxtApp()/useRequestFetch() must be called synchronously here, at
// the top of setup, before any `await` — that's the only point where
// Nuxt's composable context is guaranteed available. runWithContext()
// below re-establishes it inside the nested async catch handlers.
const nuxtApp = useNuxtApp()
const requestFetch = useRequestFetch()
const route = useRoute()
const router = useRouter()

const assetTypes = ref<AssetTypeView[]>([])
const powerSources = ref<Entry[]>([])
const useAreas = ref<Entry[]>([])
const images = ref<readonly string[]>([])
const errorCode = ref<string | null>(null)
const savedId = ref<number | null>(null)

// A number field's v-model hands back a number once typed into, a string
// before; both are read the same way.
function toMinorUnits(euros: string | number): number {
  return Math.round(Number(euros) * 100)
}

async function load() {
  try {
    // useRequestFetch(), not plain $fetch: during SSR, plain $fetch
    // making an internal request to our own API does not forward the
    // browser's cookies, so the session-gated route would 401 on every
    // first load even when the Operator is genuinely signed in.
    assetTypes.value = await requestFetch<AssetTypeView[]>('/api/catalog/asset-types')
    resetPrices()
  } catch (err: unknown) {
    await handleFetchError(err)
  }
}

async function loadEditorOptions() {
  try {
    ;[powerSources.value, useAreas.value, images.value] = await Promise.all([
      requestFetch<Entry[]>('/api/catalog/classification/power-sources'),
      requestFetch<Entry[]>('/api/catalog/classification/use-areas'),
      requestFetch<string[]>('/api/catalog/images'),
    ])
  } catch (err: unknown) {
    await handleFetchError(err)
  }
}

async function handleFetchError(err: unknown) {
  const statusCode = (err as { statusCode?: number })?.statusCode
  if (statusCode === 401) {
    await nuxtApp.runWithContext(() => navigateTo(loginLocation(useRoute().fullPath)))
    return
  }
  errorCode.value = getErrorCode(err) ?? 'UNKNOWN'
}

// --- Tabs, kept in the address so a reload or a shared link keeps them ---

type Tab = 'tools' | 'prices' | 'filters'
const tab = computed<Tab>(() => {
  const value = route.query.tab
  return value === 'prices' || value === 'filters' ? value : 'tools'
})

function setTab(next: Tab) {
  router.replace({ query: { ...route.query, tab: next === 'tools' ? undefined : next } })
}

const tabs = computed(() => [
  { id: 'tools' as const, label: sk.adminCatalog.tabs.tools },
  { id: 'prices' as const, label: sk.adminCatalog.tabs.prices },
  { id: 'filters' as const, label: sk.adminCatalog.tabs.filters },
])

// --- The list: search and a filter by state ---

type Show = 'all' | 'published' | 'unpublished' | 'accessories'
const search = ref('')
const show = ref<Show>('all')

// Diacritics do not matter when searching: "vrtacka" finds "Vŕtačka".
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

const matchesShow = (assetType: AssetTypeView, value: Show) =>
  value === 'all' ||
  (value === 'published' && assetType.published) ||
  (value === 'unpublished' && !assetType.published) ||
  (value === 'accessories' && assetType.principalIds.length > 0)

const showOptions = computed(() =>
  (['all', 'published', 'unpublished', 'accessories'] as const).map((value) => ({
    value,
    label: sk.adminCatalog.show[value],
    count: assetTypes.value.filter((a) => matchesShow(a, value)).length,
  })),
)

const visible = computed(() => {
  const query = fold(search.value.trim())
  return assetTypes.value.filter(
    (assetType) => matchesShow(assetType, show.value) && (!query || fold(assetType.name).includes(query)),
  )
})

// --- The side panel: edit one tool, or create a new one ---

const panel = ref<'edit' | 'new' | null>(null)
const editingId = ref<number | null>(null)
const savingEdit = ref(false)
const editing = computed(() => assetTypes.value.find((a) => a.id === editingId.value) ?? null)

const principalCandidates = computed(() =>
  assetTypes.value
    .filter((candidate) => candidate.id !== editingId.value && candidate.principalIds.length === 0)
    .map(({ id, name }) => ({ id, name })),
)

function startEdit(assetType: AssetTypeView) {
  errorCode.value = null
  savedId.value = null
  editingId.value = assetType.id
  panel.value = 'edit'
}

function startNew() {
  errorCode.value = null
  panel.value = 'new'
}

function closePanel() {
  panel.value = null
  editingId.value = null
}

async function saveEdit(body: Record<string, unknown>) {
  if (editingId.value === null) return
  const id = editingId.value
  errorCode.value = null
  savingEdit.value = true
  try {
    await $fetch(`/api/catalog/asset-types/${id}`, { method: 'PATCH', body })
    closePanel()
    savedId.value = id
    await load()
  } catch (err: unknown) {
    await handleFetchError(err)
  } finally {
    savingEdit.value = false
  }
}

const form = reactive({
  name: '',
  description: '',
  dayRateEuros: '',
  depositEuros: '',
})
const creating = ref(false)

async function createAssetType() {
  errorCode.value = null
  creating.value = true
  try {
    await $fetch('/api/catalog/asset-types', {
      method: 'POST',
      body: {
        name: form.name,
        description: form.description,
        dayRate: { amount: toMinorUnits(form.dayRateEuros), currency: 'EUR' },
        depositAmount: { amount: toMinorUnits(form.depositEuros), currency: 'EUR' },
      },
    })
    form.name = ''
    form.description = ''
    form.dayRateEuros = ''
    form.depositEuros = ''
    closePanel()
    await load()
  } catch (err: unknown) {
    await handleFetchError(err)
  } finally {
    creating.value = false
  }
}

const publishing = ref(false)

async function publish(assetType: AssetTypeView) {
  errorCode.value = null
  publishing.value = true
  try {
    await $fetch(`/api/catalog/asset-types/${assetType.id}/publish`, { method: 'POST' })
    await load()
  } catch (err: unknown) {
    await handleFetchError(err)
  } finally {
    publishing.value = false
  }
}

const showUnpublishConfirm = ref(false)
const unpublishing = ref(false)

async function confirmUnpublish() {
  if (!editing.value) return
  errorCode.value = null
  unpublishing.value = true
  try {
    await $fetch(`/api/catalog/asset-types/${editing.value.id}/unpublish`, { method: 'POST' })
    showUnpublishConfirm.value = false
    await load()
  } catch (err: unknown) {
    await handleFetchError(err)
  } finally {
    unpublishing.value = false
  }
}

// --- Prices: every day rate and deposit in one table, saved together ---

const priceDraft = reactive<Record<number, { dayRate: string | number; deposit: string | number }>>({})
const savingPrices = ref(false)
const pricesSavedCount = ref<number | null>(null)

const toEuros = (minor: number) => (minor / 100).toFixed(2)

function resetPrices() {
  for (const assetType of assetTypes.value) {
    priceDraft[assetType.id] = {
      dayRate: toEuros(assetType.dayRate.amount),
      deposit: toEuros(assetType.depositAmount.amount),
    }
  }
}

const isValidEuros = (value: string | number) =>
  String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0

function priceChanged(assetType: AssetTypeView): boolean {
  const draft = priceDraft[assetType.id]
  if (!draft) return false
  return (
    toMinorUnits(draft.dayRate) !== assetType.dayRate.amount ||
    toMinorUnits(draft.deposit) !== assetType.depositAmount.amount
  )
}

const changedPrices = computed(() => assetTypes.value.filter(priceChanged))
const pricesInvalid = computed(() =>
  changedPrices.value.some((a) => !isValidEuros(priceDraft[a.id]!.dayRate) || !isValidEuros(priceDraft[a.id]!.deposit)),
)

const priceRows = computed(() => {
  const query = fold(search.value.trim())
  return assetTypes.value.filter((assetType) => !query || fold(assetType.name).includes(query))
})

async function savePrices() {
  if (changedPrices.value.length === 0 || pricesInvalid.value) return
  errorCode.value = null
  pricesSavedCount.value = null
  savingPrices.value = true
  let saved = 0
  try {
    for (const assetType of changedPrices.value) {
      const draft = priceDraft[assetType.id]!
      await $fetch(`/api/catalog/asset-types/${assetType.id}`, {
        method: 'PATCH',
        body: {
          dayRate: { amount: toMinorUnits(draft.dayRate), currency: assetType.dayRate.currency },
          depositAmount: { amount: toMinorUnits(draft.deposit), currency: assetType.depositAmount.currency },
        },
      })
      saved += 1
    }
    pricesSavedCount.value = saved
  } catch (err: unknown) {
    await handleFetchError(err)
  } finally {
    savingPrices.value = false
    await load()
  }
}

await Promise.all([load(), loadEditorOptions()])
</script>

<template>
  <main class="admin-catalog">
    <header class="admin-catalog__head">
      <h1 class="admin-catalog__title">{{ sk.adminCatalog.title }}</h1>
      <AppButton variant="primary" @click="startNew">{{ sk.adminCatalog.newAction }}</AppButton>
    </header>

    <div class="admin-catalog__tabs" role="tablist" :aria-label="sk.adminCatalog.tabsLabel">
      <button
        v-for="item in tabs"
        :key="item.id"
        type="button"
        role="tab"
        class="admin-catalog__tab"
        :aria-selected="tab === item.id"
        @click="setTab(item.id)"
      >
        {{ item.label }}
      </button>
    </div>

    <AppAlert :code="errorCode" />

    <!-- Tools -->
    <section v-if="tab === 'tools'" class="admin-catalog__panel" role="tabpanel">
      <div class="admin-catalog__toolbar">
        <AppField :label="sk.adminCatalog.searchLabel">
          <template #default="slotProps">
            <input :id="slotProps.id" v-model="search" type="search" autocomplete="off" />
          </template>
        </AppField>
        <div class="admin-catalog__show" role="group" :aria-label="sk.adminCatalog.showLabel">
          <button
            v-for="option in showOptions"
            :key="option.value"
            type="button"
            class="admin-catalog__show-option"
            :aria-pressed="show === option.value"
            @click="show = option.value"
          >
            {{ option.label }} <span class="admin-catalog__show-count">{{ option.count }}</span>
          </button>
        </div>
      </div>

      <EmptyState v-if="visible.length === 0" :message="sk.adminCatalog.noMatch" />
      <ul v-else class="admin-catalog__list">
        <li v-for="assetType in visible" :key="assetType.id" class="admin-catalog__row">
          <span class="admin-catalog__thumb" aria-hidden="true">
            <img
              v-if="assetType.imageFile"
              :src="`/catalog/${assetType.imageFile}`"
              alt=""
              width="96"
              height="96"
              loading="lazy"
            />
          </span>
          <span class="admin-catalog__row-text">
            <span class="admin-catalog__row-name">
              {{ assetType.name }}
              <span v-if="assetType.principalIds.length > 0" class="admin-catalog__tag">
                {{ sk.adminCatalog.accessoryBadge }}
              </span>
            </span>
            <span class="admin-catalog__row-meta">
              {{ sk.adminCatalog.perDay.replace('{amount}', formatMoney(assetType.dayRate)) }} ·
              {{ sk.adminCatalog.depositMeta.replace('{amount}', formatMoney(assetType.depositAmount)) }}
            </span>
            <span v-if="savedId === assetType.id" class="admin-catalog__saved" role="status">
              {{ sk.adminCatalog.saved }}
            </span>
          </span>
          <StateChip
            :tone="assetType.published ? 'confirmed' : 'neutral'"
            :label="assetType.published ? sk.adminCatalog.published : sk.adminCatalog.unpublished"
          />
          <AppButton variant="secondary" @click="startEdit(assetType)">{{ sk.adminCatalog.editAction }}</AppButton>
        </li>
      </ul>
    </section>

    <!-- Prices -->
    <section v-else-if="tab === 'prices'" class="admin-catalog__panel" role="tabpanel">
      <AppAlert variant="warn" :message="sk.adminCatalog.provisionalPricesNotice" />
      <p class="admin-catalog__intro">{{ sk.adminCatalog.pricesIntro }}</p>
      <AppField :label="sk.adminCatalog.searchLabel">
        <template #default="slotProps">
          <input :id="slotProps.id" v-model="search" type="search" autocomplete="off" />
        </template>
      </AppField>

      <div class="admin-catalog__prices">
        <div class="admin-catalog__prices-head" aria-hidden="true">
          <span>{{ sk.adminCatalog.columnName }}</span>
          <span>{{ sk.adminCatalog.fieldDayRate }}</span>
          <span>{{ sk.adminCatalog.fieldDeposit }}</span>
        </div>
        <div
          v-for="assetType in priceRows"
          :key="assetType.id"
          class="admin-catalog__price-row"
          :class="{ 'admin-catalog__price-row--changed': priceChanged(assetType) }"
        >
          <span class="admin-catalog__price-name">{{ assetType.name }}</span>
          <label class="admin-catalog__price-cell">
          <span class="admin-catalog__price-label" aria-hidden="true">{{ sk.adminCatalog.fieldDayRate }}</span>
          <input
            v-model="priceDraft[assetType.id]!.dayRate"
            type="number"
            inputmode="decimal"
            min="0"
            step="0.01"
            :aria-label="sk.adminCatalog.dayRateFor.replace('{name}', assetType.name)"
            :aria-invalid="!isValidEuros(priceDraft[assetType.id]!.dayRate) ? 'true' : undefined"
            :disabled="savingPrices"
          />
          </label>
          <label class="admin-catalog__price-cell">
          <span class="admin-catalog__price-label" aria-hidden="true">{{ sk.adminCatalog.fieldDeposit }}</span>
          <input
            v-model="priceDraft[assetType.id]!.deposit"
            type="number"
            inputmode="decimal"
            min="0"
            step="0.01"
            :aria-label="sk.adminCatalog.depositFor.replace('{name}', assetType.name)"
            :aria-invalid="!isValidEuros(priceDraft[assetType.id]!.deposit) ? 'true' : undefined"
            :disabled="savingPrices"
          />
          </label>
        </div>
      </div>

      <div class="admin-catalog__prices-bar">
        <p v-if="pricesInvalid" class="admin-catalog__prices-error" role="alert">
          {{ sk.adminCatalog.pricesInvalid }}
        </p>
        <p v-else-if="pricesSavedCount !== null && changedPrices.length === 0" class="admin-catalog__saved" role="status">
          {{ sk.adminCatalog.pricesSaved.replace('{count}', String(pricesSavedCount)) }}
        </p>
        <p v-else class="admin-catalog__prices-count">
          {{ sk.adminCatalog.pricesChanged.replace('{count}', String(changedPrices.length)) }}
        </p>
        <div class="admin-catalog__prices-actions">
          <AppButton variant="quiet" :disabled="changedPrices.length === 0 || savingPrices" @click="resetPrices">
            {{ sk.adminCatalog.pricesReset }}
          </AppButton>
          <AppButton
            variant="primary"
            :pending="savingPrices"
            :disabled="changedPrices.length === 0 || pricesInvalid"
            @click="savePrices"
          >
            {{
              savingPrices
                ? sk.adminCatalog.pricesSaving
                : sk.adminCatalog.pricesSave.replace('{count}', String(changedPrices.length))
            }}
          </AppButton>
        </div>
      </div>
    </section>

    <!-- Filters -->
    <section v-else class="admin-catalog__panel" role="tabpanel">
      <p class="admin-catalog__intro">{{ sk.adminClassification.intro }}</p>
      <div class="admin-catalog__classification-lists">
        <ClassificationListEditor
          kind="power-sources"
          :heading="sk.adminClassification.powerSourcesHeading"
          @changed="loadEditorOptions"
        />
        <ClassificationListEditor
          kind="use-areas"
          :heading="sk.adminClassification.useAreasHeading"
          @changed="loadEditorOptions"
        />
      </div>
    </section>

    <SidePanel
      :open="panel === 'edit' && editing !== null"
      :title-text="editing ? sk.adminCatalog.editTitle.replace('{name}', editing.name) : ''"
      @close="closePanel"
    >
      <template v-if="editing">
        <div class="admin-catalog__publish">
          <StateChip
            :tone="editing.published ? 'confirmed' : 'neutral'"
            :label="editing.published ? sk.adminCatalog.published : sk.adminCatalog.unpublished"
          />
          <AppButton
            v-if="!editing.published"
            variant="primary"
            :pending="publishing"
            @click="publish(editing)"
          >
            {{ sk.adminCatalog.publishAction }}
          </AppButton>
          <AppButton v-else variant="quiet" class="admin-catalog__unpublish" @click="showUnpublishConfirm = true">
            {{ sk.adminCatalog.unpublishAction }}
          </AppButton>
        </div>
        <AssetTypeEditor
          :key="editing.id"
          :asset-type="editing"
          :power-sources="powerSources"
          :use-areas="useAreas"
          :images="images"
          :principal-candidates="principalCandidates"
          :pending="savingEdit"
          @save="saveEdit"
          @cancel="closePanel"
        />
      </template>
    </SidePanel>

    <SidePanel :open="panel === 'new'" :title-text="sk.adminCatalog.newHeading" @close="closePanel">
      <form class="admin-catalog__new-form" @submit.prevent="createAssetType">
        <AppField :label="sk.adminCatalog.fieldName">
          <template #default="slotProps">
            <input :id="slotProps.id" v-model="form.name" type="text" required />
          </template>
        </AppField>
        <AppField :label="sk.adminCatalog.fieldDescription">
          <template #default="slotProps">
            <input :id="slotProps.id" v-model="form.description" type="text" />
          </template>
        </AppField>
        <div class="admin-catalog__new-prices">
          <AppField :label="sk.adminCatalog.fieldDayRate">
            <template #default="slotProps">
              <input :id="slotProps.id" v-model="form.dayRateEuros" type="number" min="0" step="0.01" required />
            </template>
          </AppField>
          <AppField :label="sk.adminCatalog.fieldDeposit">
            <template #default="slotProps">
              <input :id="slotProps.id" v-model="form.depositEuros" type="number" min="0" step="0.01" required />
            </template>
          </AppField>
        </div>
        <p class="admin-catalog__intro">{{ sk.adminCatalog.newHint }}</p>
        <AppButton type="submit" variant="primary" :pending="creating">{{ sk.adminCatalog.createAction }}</AppButton>
      </form>
    </SidePanel>

    <ConfirmAction
      :open="showUnpublishConfirm"
      :title-text="sk.adminCatalog.unpublishConfirmTitle"
      :body-text="sk.adminCatalog.unpublishConfirmBody"
      :confirm-label="sk.adminCatalog.unpublishAction"
      :pending="unpublishing"
      @confirm="confirmUnpublish"
      @close="showUnpublishConfirm = false"
    />
  </main>
</template>

<style scoped>
.admin-catalog {
  box-sizing: border-box;
  max-width: 1000px;
  margin: 0 auto;
  padding: var(--ht-space-5) var(--ht-space-4) var(--ht-space-7);
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-4);
}

.admin-catalog__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ht-space-3);
}

.admin-catalog__title {
  margin: 0;
}

/* Tabs as a segmented strip; the selected one carries the signal edge. */
.admin-catalog__tabs {
  display: flex;
  gap: var(--ht-space-1);
  border-bottom: 1px solid var(--ht-line);
  overflow-x: auto;
}

.admin-catalog__tab {
  flex: none;
  min-height: var(--ht-hit-min);
  padding: 0 var(--ht-space-4);
  border: 0;
  border-bottom: 3px solid transparent;
  background: transparent;
  color: var(--ht-ink-muted);
  font-weight: 600;
  cursor: pointer;
}

.admin-catalog__tab[aria-selected='true'] {
  color: var(--ht-ink);
  border-bottom-color: var(--ht-signal);
}

.admin-catalog__panel {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-3);
}

.admin-catalog__intro {
  margin: 0;
  color: var(--ht-ink-muted);
}

.admin-catalog__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0 var(--ht-space-4);
}

.admin-catalog__toolbar > :first-child {
  flex: 1 1 260px;
}

.admin-catalog__show {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ht-space-1);
  margin-bottom: var(--ht-space-4);
}

.admin-catalog__show-option {
  min-height: var(--ht-hit-min);
  padding: 0 var(--ht-space-3);
  border: 1px solid var(--ht-line-strong);
  border-radius: var(--ht-radius-card);
  background: var(--ht-surface);
  color: var(--ht-ink);
  font-weight: 600;
  font-size: var(--ht-text-2);
  cursor: pointer;
}

.admin-catalog__show-option[aria-pressed='true'] {
  border-color: var(--ht-ink);
  background: var(--ht-ink);
  color: var(--ht-paper);
}

.admin-catalog__show-count {
  margin-left: var(--ht-space-1);
  font-weight: 400;
  opacity: 0.75;
}

.admin-catalog__list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--ht-line);
  border-radius: var(--ht-radius-card);
  background: var(--ht-surface);
}

.admin-catalog__row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--ht-space-3);
  padding: var(--ht-space-2) var(--ht-space-3);
}

.admin-catalog__row + .admin-catalog__row {
  border-top: 1px solid var(--ht-line);
}

.admin-catalog__thumb {
  width: var(--ht-space-7);
  height: var(--ht-space-7);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--ht-space-1);
  border-radius: var(--ht-radius-plate);
  background: var(--ht-surface-sunk);
}

.admin-catalog__thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.admin-catalog__row-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.admin-catalog__row-name {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.admin-catalog__row-meta {
  font-size: var(--ht-text-2);
  color: var(--ht-ink-muted);
}

.admin-catalog__tag {
  margin-left: var(--ht-space-1);
  padding: 0 var(--ht-space-1);
  border: 1px solid var(--ht-line-strong);
  border-radius: var(--ht-radius-plate);
  font-size: var(--ht-text-1);
  font-weight: 400;
  text-transform: uppercase;
  color: var(--ht-ink-muted);
}

.admin-catalog__saved {
  margin: 0;
  color: var(--ht-ok);
  font-size: var(--ht-text-2);
  font-weight: 600;
}

/* Phone: the photo and text on top, the state and the button under them. */
@media (max-width: 599px) {
  .admin-catalog__row {
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-areas:
      'thumb text'
      'chip button';
  }

  .admin-catalog__thumb {
    grid-area: thumb;
  }

  .admin-catalog__row-text {
    grid-area: text;
  }

  .admin-catalog__row > :nth-child(3) {
    grid-area: chip;
    justify-self: start;
  }

  .admin-catalog__row > :nth-child(4) {
    grid-area: button;
    justify-self: end;
  }
}

/* --- Prices --- */

.admin-catalog__prices {
  border: 1px solid var(--ht-line);
  border-radius: var(--ht-radius-card);
  background: var(--ht-surface);
}

.admin-catalog__prices-head,
.admin-catalog__price-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(88px, 140px) minmax(88px, 140px);
  align-items: center;
  gap: var(--ht-space-3);
  padding: var(--ht-space-2) var(--ht-space-3);
}

.admin-catalog__prices-head {
  font-family: var(--ht-font-condensed);
  font-weight: 600;
  font-size: var(--ht-text-1);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ht-ink-muted);
  border-bottom: 1px solid var(--ht-line);
}

.admin-catalog__price-row + .admin-catalog__price-row {
  border-top: 1px solid var(--ht-line);
}

.admin-catalog__price-row input {
  width: 100%;
  box-sizing: border-box;
  text-align: right;
  font-family: var(--ht-font-mono);
}

.admin-catalog__price-row input[aria-invalid='true'] {
  border-color: var(--ht-danger);
}

/* A changed row is marked at its edge until saved. */
.admin-catalog__price-row--changed {
  box-shadow: inset var(--ht-space-1) 0 0 var(--ht-signal);
  background: var(--ht-surface-sunk);
}

.admin-catalog__price-name {
  overflow-wrap: anywhere;
}

/* The column heads label the inputs on a wide screen; on a phone each input
 * carries its own small label under the tool's name. */
.admin-catalog__price-label {
  display: none;
}

@media (max-width: 599px) {
  .admin-catalog__prices-head {
    display: none;
  }

  .admin-catalog__price-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .admin-catalog__price-name {
    grid-column: 1 / -1;
    font-weight: 600;
  }

  .admin-catalog__price-cell {
    display: flex;
    flex-direction: column;
    gap: var(--ht-space-1);
  }

  .admin-catalog__price-label {
    display: block;
    font-family: var(--ht-font-condensed);
    font-weight: 600;
    font-size: var(--ht-text-1);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ht-ink-muted);
  }
}

.admin-catalog__prices-bar {
  position: sticky;
  bottom: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ht-space-2) var(--ht-space-3);
  padding: var(--ht-space-3) var(--ht-space-4) calc(var(--ht-space-3) + var(--ht-safe-bottom));
  border: 1px solid var(--ht-line);
  border-radius: var(--ht-radius-card);
  background: var(--ht-surface);
}

.admin-catalog__prices-bar p {
  margin: 0;
}

.admin-catalog__prices-count {
  color: var(--ht-ink-muted);
  font-size: var(--ht-text-2);
}

.admin-catalog__prices-error {
  color: var(--ht-danger);
  font-size: var(--ht-text-2);
  font-weight: 600;
}

.admin-catalog__prices-actions {
  display: flex;
  gap: var(--ht-space-2);
}

/* --- Filters --- */

.admin-catalog__classification-lists {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ht-space-5);
}

@media (min-width: 900px) {
  .admin-catalog__classification-lists {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* --- Panel content --- */

.admin-catalog__publish {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ht-space-2);
  margin-bottom: var(--ht-space-4);
  padding: var(--ht-space-3);
  border-radius: var(--ht-radius-card);
  background: var(--ht-surface);
  border: 1px solid var(--ht-line);
}

.admin-catalog__unpublish {
  color: var(--ht-danger);
}

.admin-catalog__new-form {
  display: flex;
  flex-direction: column;
}

.admin-catalog__new-prices {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 var(--ht-space-3);
}

.admin-catalog__new-form .admin-catalog__intro {
  margin-bottom: var(--ht-space-4);
  font-size: var(--ht-text-2);
}
</style>
