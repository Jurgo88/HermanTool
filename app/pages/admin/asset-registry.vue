<script setup lang="ts">
// S-20 Units and labels (F10, FR-25, FR-26, FR-27, W9; issue #9, #201).
// Rebuilt as three tabs after the owner's review (22 October 2026):
//   - All units: every AssetType with its units by state, and the labels of
//     any unit printed again with the same code (FR-26);
//   - Add units: pick a tool from Catalog by name, a count, register;
//   - To label: the W9 steps for units not yet in service — print, stick,
//     confirm (markAssetRentable); a unit registered by mistake can be
//     cancelled while it has never been in service.
// QR images are rendered client-side (`qrcode`): a tag code is opaque and
// carries no secret, so the server has nothing to protect by drawing it.
// The A4 sheet (AssetTagSheet, print.css) is print-only on this page.
import QRCode from 'qrcode'
import { sk } from '~/i18n/sk'
import { formatCount } from '~/utils/format'
import { loginLocation } from '~/utils/operator-redirect'
import { getErrorCode } from '~/utils/error-code'
import type { AssetTagSheetEntry } from '~/components/AssetTagSheet.vue'

definePageMeta({ layout: 'admin' })

interface AssetTypeOption {
  id: number
  name: string
  imageFile: string | null
}

interface UnitRef {
  assetId: number
  assetTypeId: number
  tagCode: string
}

interface PendingActivationEntry extends UnitRef {
  registeredAt: string
  // No status change since registration: still waiting for its first label.
  neverActivated: boolean
}

type AssetStatusView = 'rentable' | 'in_possession' | 'under_inspection' | 'unavailable' | 'retired'

interface TaggedAssetEntry extends UnitRef {
  status: AssetStatusView
}

interface BuilderLine {
  assetTypeId: number
  quantity: number
}

const nuxtApp = useNuxtApp()
const requestFetch = useRequestFetch()
const route = useRoute()
const router = useRouter()

const assetTypes = ref<AssetTypeOption[]>([])
const pending = ref<PendingActivationEntry[]>([])
const tagged = ref<TaggedAssetEntry[]>([])
const errorCode = ref<string | null>(null)
const errorMessage = ref<string | null>(null)
const busy = ref<string | null>(null)

const typeById = computed(() => new Map(assetTypes.value.map((t) => [t.id, t])))
const assetTypeName = (id: number) => typeById.value.get(id)?.name ?? String(id)

async function handleFetchError(err: unknown) {
  const statusCode = (err as { statusCode?: number })?.statusCode
  if (statusCode === 401) {
    await nuxtApp.runWithContext(() => navigateTo(loginLocation(useRoute().fullPath)))
    return
  }
  errorMessage.value = null
  errorCode.value = getErrorCode(err) ?? 'UNKNOWN'
}

function clearErrors() {
  errorCode.value = null
  errorMessage.value = null
}

async function load() {
  try {
    ;[assetTypes.value, pending.value, tagged.value] = await Promise.all([
      requestFetch<AssetTypeOption[]>('/api/catalog/asset-types'),
      requestFetch<PendingActivationEntry[]>('/api/asset-registry/assets/pending-activation'),
      requestFetch<TaggedAssetEntry[]>('/api/asset-registry/assets/tagged'),
    ])
  } catch (err: unknown) {
    await handleFetchError(err)
  }
}

// --- What the page counts ---

const toLabel = computed(() => pending.value.filter((p) => p.neverActivated))
const toLabelIds = computed(() => new Set(toLabel.value.map((p) => p.assetId)))

const summary = computed(() => {
  const count = (test: (t: TaggedAssetEntry) => boolean) => tagged.value.filter(test).length
  return {
    rentable: count((t) => t.status === 'rentable'),
    out: count((t) => t.status === 'in_possession' || t.status === 'under_inspection'),
    toLabel: toLabel.value.length,
    offline: count((t) => t.status === 'unavailable' && !toLabelIds.value.has(t.assetId)),
  }
})

// --- Tabs, kept in the address ---

type Tab = 'units' | 'add' | 'labels'
const tab = computed<Tab>(() => {
  const value = route.query.tab
  if (value === 'add' || value === 'labels' || value === 'units') return value
  return toLabel.value.length > 0 ? 'labels' : 'units'
})

function setTab(next: Tab) {
  router.replace({ query: { ...route.query, tab: next } })
}

// --- Printing ---

const sheetEntries = ref<AssetTagSheetEntry[]>([])

// Q-level error correction: a label on a tool gets scuffed and greasy.
async function printUnits(units: UnitRef[], busyKey: string) {
  if (units.length === 0) return
  clearErrors()
  busy.value = busyKey
  try {
    sheetEntries.value = await Promise.all(
      units.map(async (unit) => ({
        assetId: unit.assetId,
        tagCode: unit.tagCode,
        assetTypeName: assetTypeName(unit.assetTypeId),
        qrDataUrl: await QRCode.toDataURL(unit.tagCode, { margin: 1, width: 300, errorCorrectionLevel: 'Q' }),
      })),
    )
    await nextTick()
    window.print()
  } finally {
    busy.value = null
  }
}

// --- All units ---

const search = ref('')
const expandedTypeId = ref<number | null>(null)
const selected = ref<number[]>([])

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

const typeRows = computed(() => {
  const query = fold(search.value.trim())
  const unitsByType = new Map<number, TaggedAssetEntry[]>()
  for (const unit of tagged.value) {
    const list = unitsByType.get(unit.assetTypeId) ?? []
    list.push(unit)
    unitsByType.set(unit.assetTypeId, list)
  }
  return assetTypes.value
    .filter((type) => !query || fold(type.name).includes(query))
    .map((type) => {
      const units = unitsByType.get(type.id) ?? []
      const states = new Map<string, number>()
      for (const unit of units) {
        const key = toLabelIds.value.has(unit.assetId) ? 'toLabel' : unit.status
        states.set(key, (states.get(key) ?? 0) + 1)
      }
      return { type, units, states: [...states.entries()] }
    })
    // Tools that have units first, then the rest of the catalog.
    .sort((a, b) => Number(b.units.length > 0) - Number(a.units.length > 0) || a.type.name.localeCompare(b.type.name, 'sk'))
})

function toggleType(id: number) {
  expandedTypeId.value = expandedTypeId.value === id ? null : id
  selected.value = []
}

function selectAll(units: TaggedAssetEntry[]) {
  selected.value = units.map((u) => u.assetId)
}

function stateLabel(key: string): string {
  if (key === 'toLabel') return sk.adminAssetRegistry.toLabelStatus
  return (sk.adminAssetRegistry.assetStatus as Record<string, string>)[key] ?? key
}

function startAdding(typeId: number) {
  pickTypeId.value = typeId
  pickQuery.value = ''
  setTab('add')
}

// --- Add units ---

const pickQuery = ref('')
const pickTypeId = ref<number | null>(null)
const quantity = ref(1)
const lines = ref<BuilderLine[]>([])
const csv = ref('')
const registeredCount = ref<number | null>(null)

const pickMatches = computed(() => {
  const query = fold(pickQuery.value.trim())
  if (!query) return []
  return assetTypes.value.filter((type) => fold(type.name).includes(query)).slice(0, 8)
})

const picked = computed(() => (pickTypeId.value === null ? null : (typeById.value.get(pickTypeId.value) ?? null)))
const linesTotal = computed(() => lines.value.reduce((sum, line) => sum + line.quantity, 0))

function pick(id: number) {
  pickTypeId.value = id
  pickQuery.value = ''
}

function addLine() {
  if (pickTypeId.value === null) return
  const existing = lines.value.find((l) => l.assetTypeId === pickTypeId.value)
  if (existing) existing.quantity += quantity.value
  else lines.value.push({ assetTypeId: pickTypeId.value, quantity: quantity.value })
  pickTypeId.value = null
  quantity.value = 1
}

async function register(body: string) {
  clearErrors()
  if (!body.trim()) {
    errorMessage.value = sk.adminAssetRegistry.emptyCsvError
    return
  }
  busy.value = 'register'
  try {
    const { units } = await $fetch<{ units: UnitRef[] }>('/api/asset-registry/bulk-register', {
      method: 'POST',
      body: { csv: body },
    })
    lines.value = []
    csv.value = ''
    registeredCount.value = units.length
    await load()
    setTab('labels')
  } catch (err: unknown) {
    await handleFetchError(err)
  } finally {
    busy.value = null
  }
}

const registerLines = () => register(lines.value.map((l) => `${l.assetTypeId},${l.quantity}`).join('\n'))

async function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) csv.value = await file.text()
}

// --- To label ---

const toLabelGroups = computed(() => {
  const groups = new Map<number, PendingActivationEntry[]>()
  for (const entry of toLabel.value) {
    groups.set(entry.assetTypeId, [...(groups.get(entry.assetTypeId) ?? []), entry])
  }
  return [...groups.entries()]
    .map(([assetTypeId, entries]) => ({ assetTypeId, name: assetTypeName(assetTypeId), entries }))
    .sort((a, b) => a.name.localeCompare(b.name, 'sk'))
})

// W9 step 3: the label is on, the unit becomes Rentable. One request per
// unit, so a failure part-way leaves the rest as they were and visible.
async function makeRentable(units: UnitRef[], busyKey: string) {
  clearErrors()
  busy.value = busyKey
  try {
    for (const unit of units) {
      await $fetch(`/api/asset-registry/assets/${unit.assetId}/mark-rentable`, { method: 'POST' })
      pending.value = pending.value.filter((p) => p.assetId !== unit.assetId)
    }
    if (pending.value.every((p) => !p.neverActivated)) registeredCount.value = null
  } catch (err: unknown) {
    await handleFetchError(err)
  } finally {
    busy.value = null
    tagged.value = await $fetch<TaggedAssetEntry[]>('/api/asset-registry/assets/tagged').catch(() => tagged.value)
  }
}

const cancelTarget = ref<{ assetIds: number[]; body: string } | null>(null)

function askCancel(entries: PendingActivationEntry[], name: string) {
  const ids = entries.filter((e) => e.neverActivated).map((e) => e.assetId)
  cancelTarget.value = {
    assetIds: ids,
    body:
      ids.length === 1
        ? sk.adminAssetRegistry.cancelConfirmOne.replace('{tag}', entries.find((e) => e.assetId === ids[0])!.tagCode)
        : sk.adminAssetRegistry.cancelConfirmGroup.replace('{count}', String(ids.length)).replace('{name}', name),
  }
}

async function confirmCancel() {
  if (!cancelTarget.value) return
  clearErrors()
  busy.value = 'cancel'
  try {
    for (const assetId of cancelTarget.value.assetIds) {
      await $fetch(`/api/asset-registry/assets/${assetId}/cancel-registration`, { method: 'POST' })
      pending.value = pending.value.filter((p) => p.assetId !== assetId)
      tagged.value = tagged.value.filter((t) => t.assetId !== assetId)
    }
  } catch (err: unknown) {
    await handleFetchError(err)
  } finally {
    cancelTarget.value = null
    busy.value = null
  }
}

await load()
</script>

<template>
  <main class="registry">
    <header class="registry__head no-print">
      <h1 class="registry__title">{{ sk.adminAssetRegistry.title }}</h1>
      <p class="registry__intro">{{ sk.adminAssetRegistry.intro }}</p>
      <dl class="registry__summary">
        <div class="registry__figure registry__figure--ok">
          <dt>{{ sk.adminAssetRegistry.summaryRentable }}</dt>
          <dd>{{ summary.rentable }}</dd>
        </div>
        <div class="registry__figure">
          <dt>{{ sk.adminAssetRegistry.summaryOut }}</dt>
          <dd>{{ summary.out }}</dd>
        </div>
        <div class="registry__figure" :class="{ 'registry__figure--attention': summary.toLabel > 0 }">
          <dt>{{ sk.adminAssetRegistry.summaryToLabel }}</dt>
          <dd>{{ summary.toLabel }}</dd>
        </div>
        <div v-if="summary.offline > 0" class="registry__figure">
          <dt>{{ sk.adminAssetRegistry.summaryOffline }}</dt>
          <dd>{{ summary.offline }}</dd>
        </div>
      </dl>
    </header>

    <div class="registry__tabs no-print" role="tablist" :aria-label="sk.adminAssetRegistry.tabsLabel">
      <button
        v-for="item in (['units', 'add', 'labels'] as const)"
        :key="item"
        type="button"
        role="tab"
        class="registry__tab"
        :aria-selected="tab === item"
        @click="setTab(item)"
      >
        {{ sk.adminAssetRegistry.tabs[item] }}
        <span v-if="item === 'labels' && toLabel.length > 0" class="registry__tab-badge">{{ toLabel.length }}</span>
      </button>
    </div>

    <AppAlert class="no-print" :code="errorCode" :message="errorMessage" />
    <EmptyState v-if="assetTypes.length === 0" class="no-print" :message="sk.adminAssetRegistry.noAssetTypes" />

    <!-- All units -->
    <section v-else-if="tab === 'units'" class="registry__panel no-print" role="tabpanel">
      <div class="registry__toolbar">
        <AppField :label="sk.adminAssetRegistry.searchLabel">
          <template #default="slotProps">
            <input :id="slotProps.id" v-model="search" type="search" autocomplete="off" />
          </template>
        </AppField>
        <AppButton
          variant="secondary"
          :disabled="tagged.length === 0 || busy !== null"
          :pending="busy === 'print-all'"
          @click="printUnits(tagged, 'print-all')"
        >
          {{ sk.adminAssetRegistry.printAllAction.replace('{count}', String(tagged.length)) }}
        </AppButton>
      </div>

      <EmptyState v-if="typeRows.length === 0" :message="sk.adminAssetRegistry.noMatch" />
      <ul v-else class="registry__types">
        <li v-for="row in typeRows" :key="row.type.id" class="registry__type">
          <div class="registry__type-row">
            <span class="registry__thumb" aria-hidden="true">
              <img
                v-if="row.type.imageFile"
                :src="`/catalog/${row.type.imageFile}`"
                alt=""
                width="96"
                height="96"
                loading="lazy"
              />
            </span>
            <span class="registry__type-text">
              <span class="registry__type-name">{{ row.type.name }}</span>
              <span v-if="row.units.length === 0" class="registry__type-meta">{{ sk.adminAssetRegistry.noUnits }}</span>
              <span v-else class="registry__type-meta">
                {{ formatCount(row.units.length, sk.adminAssetRegistry.unitCount) }}:
                <template v-for="([key, count], index) in row.states" :key="key">
                  <span :class="`registry__state registry__state--${key}`">{{ count }} {{ stateLabel(key) }}</span
                  ><template v-if="index < row.states.length - 1">, </template>
                </template>
              </span>
            </span>
            <AppButton v-if="row.units.length === 0" variant="quiet" @click="startAdding(row.type.id)">
              {{ sk.adminAssetRegistry.addUnitsAction }}
            </AppButton>
            <button
              v-else
              type="button"
              class="registry__toggle"
              :aria-expanded="expandedTypeId === row.type.id"
              :aria-label="sk.adminAssetRegistry.labelsToggleLabel.replace('{name}', row.type.name)"
              @click="toggleType(row.type.id)"
            >
              {{ sk.adminAssetRegistry.labelsToggle }}
              <span class="registry__chevron" aria-hidden="true" />
            </button>
          </div>

          <div v-if="expandedTypeId === row.type.id" class="registry__labels">
            <ul class="registry__units">
              <li v-for="unit in row.units" :key="unit.assetId" class="registry__unit">
                <label class="registry__unit-pick">
                  <input v-model="selected" type="checkbox" :value="unit.assetId" />
                  <TagCodePlate>{{ unit.tagCode }}</TagCodePlate>
                  <span :class="`registry__state registry__state--${toLabelIds.has(unit.assetId) ? 'toLabel' : unit.status}`">
                    {{ stateLabel(toLabelIds.has(unit.assetId) ? 'toLabel' : unit.status) }}
                  </span>
                </label>
                <AppButton
                  v-if="unit.status === 'unavailable' && !toLabelIds.has(unit.assetId)"
                  variant="quiet"
                  :aria-label="sk.adminAssetRegistry.makeRentableAgainLabel.replace('{tag}', unit.tagCode)"
                  :disabled="busy !== null"
                  :pending="busy === `again-${unit.assetId}`"
                  @click="makeRentable([unit], `again-${unit.assetId}`)"
                >
                  {{ sk.adminAssetRegistry.makeRentableAgainAction }}
                </AppButton>
              </li>
            </ul>
            <div class="registry__actions">
              <AppButton variant="quiet" @click="selectAll(row.units)">{{ sk.adminAssetRegistry.selectAll }}</AppButton>
              <AppButton
                variant="primary"
                :disabled="selected.length === 0 || busy !== null"
                :pending="busy === 'print-selected'"
                @click="printUnits(row.units.filter((u) => selected.includes(u.assetId)), 'print-selected')"
              >
                {{ sk.adminAssetRegistry.printSelectedAction.replace('{count}', String(selected.length)) }}
              </AppButton>
            </div>
          </div>
        </li>
      </ul>
    </section>

    <!-- Add units -->
    <section v-else-if="tab === 'add'" class="registry__panel no-print" role="tabpanel">
      <div class="registry__card">
        <h2 class="registry__card-title">{{ sk.adminAssetRegistry.addHeading }}</h2>
        <p class="registry__muted">{{ sk.adminAssetRegistry.addIntro }}</p>

        <div v-if="picked" class="registry__picked">
          <span class="registry__thumb" aria-hidden="true">
            <img v-if="picked.imageFile" :src="`/catalog/${picked.imageFile}`" alt="" width="96" height="96" />
          </span>
          <span class="registry__type-text">
            <span class="registry__muted">{{ sk.adminAssetRegistry.pickedLabel }}</span>
            <span class="registry__type-name">{{ picked.name }}</span>
          </span>
          <AppButton variant="quiet" @click="pickTypeId = null">{{ sk.adminAssetRegistry.changePickAction }}</AppButton>
        </div>
        <template v-else>
          <AppField :label="sk.adminAssetRegistry.pickLabel">
            <template #default="slotProps">
              <input
                :id="slotProps.id"
                v-model="pickQuery"
                type="search"
                autocomplete="off"
                :placeholder="sk.adminAssetRegistry.pickPlaceholder"
              />
            </template>
          </AppField>
          <ul v-if="pickMatches.length > 0" class="registry__matches">
            <li v-for="type in pickMatches" :key="type.id">
              <button type="button" class="registry__match" @click="pick(type.id)">
                <span class="registry__thumb registry__thumb--small" aria-hidden="true">
                  <img v-if="type.imageFile" :src="`/catalog/${type.imageFile}`" alt="" width="64" height="64" />
                </span>
                {{ type.name }}
              </button>
            </li>
          </ul>
          <p v-else-if="pickQuery.trim()" class="registry__muted">{{ sk.adminAssetRegistry.pickNoMatch }}</p>
        </template>

        <div class="registry__add-row">
          <div class="registry__quantity">
            <span class="registry__quantity-label">{{ sk.adminAssetRegistry.quantityLabel }}</span>
            <QuantityStepper
              v-model="quantity"
              :max="200"
              :decrease-label="sk.adminAssetRegistry.quantityDecrease"
              :increase-label="sk.adminAssetRegistry.quantityIncrease"
            />
          </div>
          <AppButton variant="secondary" :disabled="pickTypeId === null" @click="addLine">
            {{ sk.adminAssetRegistry.addLineAction }}
          </AppButton>
        </div>
      </div>

      <div class="registry__card">
        <h2 class="registry__card-title">{{ sk.adminAssetRegistry.linesHeading }}</h2>
        <p v-if="lines.length === 0" class="registry__muted">{{ sk.adminAssetRegistry.linesEmpty }}</p>
        <ul v-else class="registry__lines">
          <li v-for="(line, index) in lines" :key="line.assetTypeId" class="registry__line">
            <span class="registry__type-name">{{ assetTypeName(line.assetTypeId) }}</span>
            <QuantityStepper
              v-model="line.quantity"
              :max="200"
              :decrease-label="sk.adminAssetRegistry.quantityDecrease"
              :increase-label="sk.adminAssetRegistry.quantityIncrease"
            />
            <button
              type="button"
              class="registry__remove"
              :aria-label="sk.adminAssetRegistry.removeLineLabel.replace('{name}', assetTypeName(line.assetTypeId))"
              @click="lines.splice(index, 1)"
            >
              <span aria-hidden="true">{{ sk.adminAssetRegistry.removeLineGlyph }}</span>
            </button>
          </li>
        </ul>
        <AppButton
          variant="primary"
          size="counter"
          class="registry__submit"
          :disabled="lines.length === 0 || busy !== null"
          :pending="busy === 'register'"
          @click="registerLines"
        >
          {{
            busy === 'register'
              ? sk.adminAssetRegistry.submitting
              : sk.adminAssetRegistry.submitAction.replace(
                  '{count}',
                  formatCount(linesTotal, sk.adminAssetRegistry.unitCount),
                )
          }}
        </AppButton>
      </div>

      <details class="registry__csv">
        <summary>{{ sk.adminAssetRegistry.csvToggle }}</summary>
        <p class="registry__muted">{{ sk.adminAssetRegistry.csvHelp }}</p>
        <AppField :label="sk.adminAssetRegistry.csvFileLabel">
          <template #default="slotProps">
            <input :id="slotProps.id" type="file" accept=".csv,text/csv" @change="onFileChange" />
          </template>
        </AppField>
        <AppField :label="sk.adminAssetRegistry.csvTextareaLabel">
          <template #default="slotProps">
            <textarea :id="slotProps.id" v-model="csv" rows="5"></textarea>
          </template>
        </AppField>
        <AppButton variant="secondary" :disabled="busy !== null" :pending="busy === 'register'" @click="register(csv)">
          {{ sk.adminAssetRegistry.csvSubmitAction }}
        </AppButton>
      </details>
    </section>

    <!-- To label -->
    <section v-else class="registry__panel no-print" role="tabpanel">
      <p v-if="registeredCount !== null && toLabel.length > 0" class="registry__notice" role="status">
        {{
          sk.adminAssetRegistry.registeredNotice.replace(
            '{count}',
            formatCount(registeredCount, sk.adminAssetRegistry.unitCount),
          )
        }}
      </p>

      <ol v-if="toLabel.length > 0" class="registry__steps" :aria-label="sk.adminAssetRegistry.stepsHeading">
        <li v-for="(step, index) in sk.adminAssetRegistry.steps" :key="index">{{ step }}</li>
      </ol>

      <div v-if="toLabel.length === 0" class="registry__card registry__empty">
        <p>{{ sk.adminAssetRegistry.toLabelEmpty }}</p>
        <AppButton variant="secondary" @click="setTab('add')">{{ sk.adminAssetRegistry.addUnitsAction }}</AppButton>
      </div>
      <template v-else>
        <div class="registry__actions registry__actions--top">
          <AppButton
            variant="primary"
            :disabled="busy !== null"
            :pending="busy === 'print-labels'"
            @click="printUnits(toLabel, 'print-labels')"
          >
            {{ sk.adminAssetRegistry.printAllToLabelAction.replace('{count}', String(toLabel.length)) }}
          </AppButton>
          <AppButton
            variant="secondary"
            :disabled="busy !== null"
            :pending="busy === 'stuck-all'"
            @click="makeRentable(toLabel, 'stuck-all')"
          >
            {{ sk.adminAssetRegistry.stuckAllAction.replace('{count}', String(toLabel.length)) }}
          </AppButton>
        </div>

        <article v-for="group in toLabelGroups" :key="group.assetTypeId" class="registry__card registry__group">
          <header class="registry__group-head">
            <span class="registry__thumb" aria-hidden="true">
              <img
                v-if="typeById.get(group.assetTypeId)?.imageFile"
                :src="`/catalog/${typeById.get(group.assetTypeId)!.imageFile}`"
                alt=""
                width="96"
                height="96"
              />
            </span>
            <h2 class="registry__card-title">
              {{ group.name }}
              <span class="registry__muted">· {{ formatCount(group.entries.length, sk.adminAssetRegistry.unitCount) }}</span>
            </h2>
          </header>
          <ul class="registry__units">
            <li v-for="entry in group.entries" :key="entry.assetId" class="registry__unit">
              <TagCodePlate>{{ entry.tagCode }}</TagCodePlate>
              <AppButton
                variant="quiet"
                :aria-label="sk.adminAssetRegistry.stuckOneLabel.replace('{tag}', entry.tagCode)"
                :disabled="busy !== null"
                :pending="busy === `stuck-${entry.assetId}`"
                @click="makeRentable([entry], `stuck-${entry.assetId}`)"
              >
                {{ sk.adminAssetRegistry.stuckOneAction }}
              </AppButton>
              <AppButton
                variant="quiet"
                class="registry__danger"
                :aria-label="sk.adminAssetRegistry.cancelOneLabel.replace('{tag}', entry.tagCode)"
                :disabled="busy !== null"
                @click="askCancel([entry], group.name)"
              >
                {{ sk.adminAssetRegistry.cancelOneAction }}
              </AppButton>
            </li>
          </ul>
          <div class="registry__actions">
            <AppButton
              variant="secondary"
              :disabled="busy !== null"
              :pending="busy === `print-${group.assetTypeId}`"
              @click="printUnits(group.entries, `print-${group.assetTypeId}`)"
            >
              {{ sk.adminAssetRegistry.printGroupAction }}
            </AppButton>
            <AppButton
              variant="primary"
              :disabled="busy !== null"
              :pending="busy === `stuck-group-${group.assetTypeId}`"
              @click="makeRentable(group.entries, `stuck-group-${group.assetTypeId}`)"
            >
              {{ sk.adminAssetRegistry.stuckGroupAction.replace('{count}', String(group.entries.length)) }}
            </AppButton>
            <AppButton
              v-if="group.entries.length > 1"
              variant="quiet"
              class="registry__danger"
              :disabled="busy !== null"
              @click="askCancel(group.entries, group.name)"
            >
              {{ sk.adminAssetRegistry.cancelGroupAction.replace('{count}', String(group.entries.length)) }}
            </AppButton>
          </div>
        </article>
      </template>
    </section>

    <ConfirmAction
      :open="cancelTarget !== null"
      :title-text="sk.adminAssetRegistry.cancelConfirmTitle"
      :body-text="cancelTarget?.body ?? ''"
      :confirm-label="sk.adminAssetRegistry.cancelConfirmAction"
      :pending="busy === 'cancel'"
      @confirm="confirmCancel"
      @close="cancelTarget = null"
    />

    <!-- Only the sheets print; on screen they stay out of the way. -->
    <section v-if="sheetEntries.length > 0" class="registry__sheets">
      <AssetTagSheet :entries="sheetEntries" />
    </section>
  </main>
</template>

<style scoped>
.registry {
  box-sizing: border-box;
  max-width: 1000px;
  margin: 0 auto;
  padding: var(--ht-space-5) var(--ht-space-4) var(--ht-space-7);
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-4);
}

.registry__head {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-2);
}

.registry__title,
.registry__intro {
  margin: 0;
}

.registry__intro,
.registry__muted {
  color: var(--ht-ink-muted);
}

.registry__muted {
  margin: 0;
  font-size: var(--ht-text-2);
  font-weight: 400;
}

/* --- Summary figures --- */

.registry__summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--ht-space-2);
  margin: var(--ht-space-2) 0 0;
}

.registry__figure {
  display: flex;
  flex-direction: column-reverse;
  padding: var(--ht-space-3);
  border: var(--ht-line-width) solid var(--ht-line);
  border-radius: var(--ht-radius-card);
  background: var(--ht-surface);
}

.registry__figure dt {
  font-size: var(--ht-text-2);
  color: var(--ht-ink-muted);
}

.registry__figure dd {
  margin: 0;
  font-family: var(--ht-font-condensed);
  font-size: var(--ht-text-5);
  font-weight: 700;
  line-height: 1.1;
}

.registry__figure--ok dd {
  color: var(--ht-ok);
}

.registry__figure--attention {
  border-color: var(--ht-signal);
  box-shadow: inset 0 calc(var(--ht-space-1) * -1) 0 var(--ht-signal);
}

/* --- Tabs --- */

.registry__tabs {
  display: flex;
  gap: var(--ht-space-1);
  border-bottom: var(--ht-line-width) solid var(--ht-line);
  overflow-x: auto;
}

.registry__tab {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: var(--ht-space-2);
  min-height: var(--ht-hit-min);
  padding: 0 var(--ht-space-4);
  border: 0;
  border-bottom: 3px solid transparent;
  background: transparent;
  color: var(--ht-ink-muted);
  font-weight: 600;
  cursor: pointer;
}

.registry__tab[aria-selected='true'] {
  color: var(--ht-ink);
  border-bottom-color: var(--ht-signal);
}

.registry__tab-badge {
  min-width: var(--ht-space-5);
  padding: 0 var(--ht-space-1);
  border-radius: var(--ht-radius-pill);
  background: var(--ht-signal);
  color: var(--ht-on-signal);
  font-size: var(--ht-text-1);
  font-weight: 700;
  text-align: center;
}

.registry__panel {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-3);
}

.registry__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0 var(--ht-space-3);
}

.registry__toolbar > :first-child {
  flex: 1 1 260px;
}

.registry__toolbar > .app-button {
  margin-bottom: var(--ht-space-4);
}

/* --- Rows of tools --- */

.registry__types {
  list-style: none;
  margin: 0;
  padding: 0;
  border: var(--ht-line-width) solid var(--ht-line);
  border-radius: var(--ht-radius-card);
  background: var(--ht-surface);
}

.registry__type + .registry__type {
  border-top: var(--ht-line-width) solid var(--ht-line);
}

.registry__type-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ht-space-3);
  padding: var(--ht-space-2) var(--ht-space-3);
}

.registry__thumb {
  flex: none;
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

.registry__thumb--small {
  width: var(--ht-space-6);
  height: var(--ht-space-6);
}

.registry__thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.registry__type-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.registry__type-name {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.registry__type-meta {
  font-size: var(--ht-text-2);
  color: var(--ht-ink-muted);
}

.registry__state {
  white-space: nowrap;
}

.registry__state--rentable {
  color: var(--ht-ok);
  font-weight: 600;
}

.registry__state--toLabel {
  color: var(--ht-signal-deep);
  font-weight: 600;
}

.registry__toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--ht-space-2);
  min-height: var(--ht-hit-min);
  padding: 0 var(--ht-space-3);
  border: var(--ht-line-width) solid var(--ht-line-strong);
  border-radius: var(--ht-radius-card);
  background: var(--ht-surface);
  color: var(--ht-ink);
  font-weight: 600;
  cursor: pointer;
}

.registry__toggle[aria-expanded='true'] {
  border-color: var(--ht-ink);
}

/* A drawn chevron: down when closed, up when open. */
.registry__chevron {
  width: var(--ht-space-2);
  height: var(--ht-space-2);
  border: solid currentcolor;
  border-width: 0 calc(var(--ht-space-1) / 2) calc(var(--ht-space-1) / 2) 0;
  transform: translateY(-25%) rotate(45deg);
}

.registry__toggle[aria-expanded='true'] .registry__chevron {
  transform: translateY(25%) rotate(-135deg);
}

.registry__labels {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-2);
  padding: var(--ht-space-2) var(--ht-space-3) var(--ht-space-3);
  background: var(--ht-surface-sunk);
}

.registry__units {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--ht-space-2);
}

.registry__unit {
  display: inline-flex;
  align-items: center;
  gap: var(--ht-space-1);
  padding-right: var(--ht-space-1);
  border: var(--ht-line-width) solid var(--ht-line);
  border-radius: var(--ht-radius-card);
  background: var(--ht-surface);
}

.registry__unit-pick {
  display: inline-flex;
  align-items: center;
  gap: var(--ht-space-2);
  min-height: var(--ht-hit-min);
  padding: 0 var(--ht-space-2);
  font-size: var(--ht-text-2);
  cursor: pointer;
}

.registry__unit-pick input {
  width: var(--ht-space-5);
  height: var(--ht-space-5);
  margin: 0;
}

.registry__group .registry__unit {
  padding-left: var(--ht-space-2);
}

.registry__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ht-space-2);
}

.registry__danger {
  color: var(--ht-danger);
}

/* --- Cards (add, to label) --- */

.registry__card {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-3);
  padding: var(--ht-space-4);
  border: var(--ht-line-width) solid var(--ht-line);
  border-radius: var(--ht-radius-card);
  background: var(--ht-surface);
}

.registry__card :deep(.app-field) {
  margin-bottom: 0;
}

.registry__card-title {
  margin: 0;
  font-size: var(--ht-text-4);
}

.registry__picked {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ht-space-3);
  padding: var(--ht-space-2) var(--ht-space-3);
  border: 2px solid var(--ht-signal);
  border-radius: var(--ht-radius-card);
}

.registry__matches {
  list-style: none;
  margin: 0;
  padding: 0;
  border: var(--ht-line-width) solid var(--ht-line);
  border-radius: var(--ht-radius-card);
  overflow: hidden;
}

.registry__matches li + li {
  border-top: var(--ht-line-width) solid var(--ht-line);
}

.registry__match {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--ht-space-3);
  min-height: var(--ht-hit-min);
  padding: var(--ht-space-1) var(--ht-space-3);
  border: 0;
  background: var(--ht-surface);
  color: var(--ht-ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.registry__match:hover {
  background: var(--ht-surface-sunk);
}

.registry__add-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--ht-space-3);
}

.registry__quantity {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-1);
}

.registry__quantity-label {
  font-family: var(--ht-font-condensed);
  font-weight: 600;
  font-size: var(--ht-text-1);
  text-transform: uppercase;
  letter-spacing: var(--ht-tracking-wide);
  color: var(--ht-ink-muted);
}

.registry__lines {
  list-style: none;
  margin: 0;
  padding: 0;
}

.registry__line {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--ht-space-3);
  padding: var(--ht-space-2) 0;
}

.registry__line + .registry__line {
  border-top: var(--ht-line-width) solid var(--ht-line);
}

.registry__remove {
  width: var(--ht-hit-min);
  height: var(--ht-hit-min);
  border: 0;
  border-radius: var(--ht-radius-card);
  background: transparent;
  color: var(--ht-ink-muted);
  font-size: var(--ht-text-5);
  line-height: 1;
  cursor: pointer;
}

.registry__remove:hover {
  background: var(--ht-surface-sunk);
  color: var(--ht-danger);
}

.registry__submit {
  width: 100%;
}

.registry__csv {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-2);
  padding: var(--ht-space-3) var(--ht-space-4);
  border: var(--ht-line-width) dashed var(--ht-line-strong);
  border-radius: var(--ht-radius-card);
}

.registry__csv summary {
  min-height: var(--ht-hit-min);
  display: flex;
  align-items: center;
  font-weight: 600;
  cursor: pointer;
}

/* --- To label --- */

.registry__notice {
  margin: 0;
  padding: var(--ht-space-3) var(--ht-space-4);
  border-radius: var(--ht-radius-card);
  background: var(--ht-ok);
  color: var(--ht-on-brand);
  font-weight: 600;
}

.registry__steps {
  counter-reset: step;
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--ht-space-2);
}

.registry__steps li {
  counter-increment: step;
  position: relative;
  padding: var(--ht-space-3) var(--ht-space-3) var(--ht-space-3) calc(var(--ht-space-6) + var(--ht-space-3));
  border: var(--ht-line-width) solid var(--ht-line);
  border-radius: var(--ht-radius-card);
  background: var(--ht-surface);
  font-size: var(--ht-text-2);
}

.registry__steps li::before {
  content: counter(step);
  position: absolute;
  left: var(--ht-space-3);
  top: var(--ht-space-3);
  width: var(--ht-space-5);
  height: var(--ht-space-5);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--ht-ink);
  color: var(--ht-signal);
  font-weight: 700;
  font-size: var(--ht-text-1);
}

.registry__empty {
  align-items: flex-start;
}

.registry__empty p {
  margin: 0;
}

.registry__group-head {
  display: flex;
  align-items: center;
  gap: var(--ht-space-3);
}

@media (max-width: 599px) {
  /* The figures stay one compact row on a phone. */
  .registry__summary {
    grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
  }

  .registry__figure {
    padding: var(--ht-space-2);
  }

  .registry__figure dt {
    font-size: var(--ht-text-1);
    line-height: 1.25;
  }

  .registry__figure dd {
    font-size: var(--ht-text-4);
  }

  .registry__type-row {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .registry__type-row > :last-child {
    grid-column: 1 / -1;
    justify-self: end;
  }

  .registry__line {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .registry__line > .registry__type-name {
    grid-column: 1 / -1;
  }
}

/* --- Print: only the sheets, edge to edge (the @page margins in print.css
 * place the grid, so the page must add none of its own). --- */
.registry__sheets {
  display: none;
}

@media print {
  .no-print {
    display: none;
  }

  .registry__sheets {
    display: block;
  }

  .registry {
    max-width: none;
    margin: 0;
    padding: 0;
    gap: 0;
  }
}
</style>
