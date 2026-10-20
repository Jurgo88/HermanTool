<script setup lang="ts">
// QR tag generation & 200-asset pilot bootstrap (F10, FR-25, FR-26, W9,
// S-20; issue #9). Posts a CSV of (assetTypeId, quantity) lines to
// /api/asset-registry/bulk-register, which registers each Asset and
// generates+binds a fresh opaque tag code (server/contexts/asset-registry/tag-code.ts)
// for it — this page's only job is turning the returned tag codes into
// QR images and a printable sheet. QR rendering happens entirely
// client-side (the `qrcode` package): a tag code has no security
// purpose (unlike D-23's Customer access token), so there is nothing
// here for the server to protect by generating the image itself.
//
// The primary input is a line builder — pick an AssetType by NAME from
// Catalog (reusing GET /api/catalog/asset-types, the same endpoint
// ./catalog.vue already uses) rather than typing its numeric id, which
// tested confusing and error-prone (an Operator has no reason to know
// or copy AssetType ids by heart). Raw CSV paste/upload stays available
// as a secondary, "advanced" path for a Tenant preparing a large import
// from a spreadsheet — the backend's parseBulkRegistrationCsv is
// unchanged; the builder just generates the same CSV text under the
// hood before submitting.
//
// UI-OQ-4 answered 2026-10-09: plain A4 for now. The sheet is 3 × 7 labels
// of 63.5 × 38.1 mm (AssetTagSheet, print.css), cut along dashed edges, and
// the same grid fits that common label stock later. The sheet is also
// printable from the pending-activation list, because the codes of Assets
// not yet tagged are all there is to reprint a lost sheet from.
import QRCode from 'qrcode'
import { sk } from '~/i18n/sk'
import { loginLocation } from '~/utils/operator-redirect'
import { getErrorCode } from '~/utils/error-code'
import type { AssetTagSheetEntry } from '~/components/AssetTagSheet.vue'

definePageMeta({ layout: 'admin' })

interface AssetTypeOption {
  id: number
  name: string
}

interface BulkRegisteredUnitView {
  assetId: number
  assetTypeId: number
  tagCode: string
}

interface PendingActivationEntry {
  assetId: number
  assetTypeId: number
  tagCode: string
  registeredAt: string
  // No status change since registration: the registration may be cancelled.
  neverActivated: boolean
}

type AssetStatusView = 'rentable' | 'in_possession' | 'under_inspection' | 'unavailable' | 'retired'

interface TaggedAssetEntry {
  assetId: number
  assetTypeId: number
  status: AssetStatusView
  tagCode: string
}

interface BuilderLine {
  assetTypeId: number
  assetTypeName: string
  quantity: number
}

const nuxtApp = useNuxtApp()
const requestFetch = useRequestFetch()

const assetTypes = ref<AssetTypeOption[]>([])
const lines = ref<BuilderLine[]>([])
const selectedAssetTypeId = ref<number | null>(null)
const quantityInput = ref('')

const csv = ref('')
const errorCode = ref<string | null>(null)
const errorMessage = ref<string | null>(null)
const submitting = ref(false)
const entries = ref<AssetTagSheetEntry[]>([])
const preparingPendingSheet = ref(false)

const pending = ref<PendingActivationEntry[]>([])
const markingRentableAssetId = ref<number | null>(null)
const markingAllRentable = ref(false)
const markingGroupId = ref<number | null>(null)

// One card per AssetType, its units as tags: twelve units of one drill read
// as "Vŕtačka × 12", not as twelve rows.
const pendingGroups = computed(() => {
  const groups = new Map<number, { assetTypeId: number; name: string; entries: PendingActivationEntry[] }>()
  for (const entry of pending.value) {
    const group = groups.get(entry.assetTypeId) ?? {
      assetTypeId: entry.assetTypeId,
      name: assetTypeName(entry.assetTypeId),
      entries: [],
    }
    group.entries.push(entry)
    groups.set(entry.assetTypeId, group)
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'sk'))
})

const markingAny = computed(
  () => markingAllRentable.value || markingGroupId.value !== null || markingRentableAssetId.value !== null,
)

function assetTypeName(assetTypeId: number): string {
  return assetTypes.value.find((a) => a.id === assetTypeId)?.name ?? String(assetTypeId)
}

async function handleFetchError(err: unknown) {
  const statusCode = (err as { statusCode?: number })?.statusCode
  if (statusCode === 401) {
    await nuxtApp.runWithContext(() => navigateTo(loginLocation(useRoute().fullPath)))
    return
  }
  errorMessage.value = null
  errorCode.value = getErrorCode(err) ?? 'UNKNOWN'
}

async function loadAssetTypes() {
  try {
    assetTypes.value = await requestFetch<AssetTypeOption[]>('/api/catalog/asset-types')
    if (assetTypes.value.length > 0) selectedAssetTypeId.value = assetTypes.value[0]!.id
  } catch (err: unknown) {
    await handleFetchError(err)
  }
}

function addLine() {
  errorCode.value = null
  errorMessage.value = null
  const assetTypeId = selectedAssetTypeId.value
  const quantity = Number(quantityInput.value)
  if (!assetTypeId || !Number.isInteger(quantity) || quantity <= 0) {
    errorMessage.value = sk.adminAssetRegistry.invalidLineError
    return
  }

  const assetType = assetTypes.value.find((a) => a.id === assetTypeId)!
  const existing = lines.value.find((l) => l.assetTypeId === assetTypeId)
  if (existing) {
    existing.quantity += quantity
  } else {
    lines.value.push({ assetTypeId, assetTypeName: assetType.name, quantity })
  }
  quantityInput.value = ''
}

function removeLine(index: number) {
  lines.value.splice(index, 1)
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  csv.value = await file.text()
}

function buildCsv(): string {
  if (lines.value.length > 0) {
    return lines.value.map((l) => `${l.assetTypeId},${l.quantity}`).join('\n')
  }
  return csv.value
}

async function submit() {
  errorCode.value = null
  errorMessage.value = null
  const body = buildCsv()
  if (!body.trim()) {
    errorMessage.value = sk.adminAssetRegistry.emptyCsvError
    return
  }

  submitting.value = true
  entries.value = []
  try {
    const { units } = await $fetch<{ units: BulkRegisteredUnitView[] }>('/api/asset-registry/bulk-register', {
      method: 'POST',
      body: { csv: body },
    })

    entries.value = await toSheetEntries(units)
    lines.value = []
    csv.value = ''
    await loadPending()
  } catch (err: unknown) {
    await handleFetchError(err)
  } finally {
    submitting.value = false
  }
}

// Q-level error correction: a label on a tool gets scuffed and greasy.
async function toSheetEntries(units: BulkRegisteredUnitView[]): Promise<AssetTagSheetEntry[]> {
  return Promise.all(
    units.map(async (unit) => ({
      assetId: unit.assetId,
      tagCode: unit.tagCode,
      assetTypeName: assetTypeName(unit.assetTypeId),
      qrDataUrl: await QRCode.toDataURL(unit.tagCode, { margin: 1, width: 300, errorCorrectionLevel: 'Q' }),
    })),
  )
}

function print() {
  window.print()
}

// The sheet for every Asset still waiting for its label to go on.
async function printPendingSheet() {
  errorCode.value = null
  errorMessage.value = null
  preparingPendingSheet.value = true
  try {
    await printEntries(pending.value)
  } catch (err: unknown) {
    await handleFetchError(err)
  } finally {
    preparingPendingSheet.value = false
  }
}

async function loadPending() {
  try {
    pending.value = await requestFetch<PendingActivationEntry[]>('/api/asset-registry/assets/pending-activation')
  } catch (err: unknown) {
    await handleFetchError(err)
  }
}

async function markRentable(assetId: number) {
  errorCode.value = null
  errorMessage.value = null
  markingRentableAssetId.value = assetId
  try {
    await $fetch(`/api/asset-registry/assets/${assetId}/mark-rentable`, { method: 'POST' })
    pending.value = pending.value.filter((p) => p.assetId !== assetId)
  } catch (err: unknown) {
    await handleFetchError(err)
  } finally {
    markingRentableAssetId.value = null
  }
}

async function markAllRentable() {
  errorCode.value = null
  errorMessage.value = null
  markingAllRentable.value = true
  try {
    for (const entry of [...pending.value]) {
      await $fetch(`/api/asset-registry/assets/${entry.assetId}/mark-rentable`, { method: 'POST' })
      pending.value = pending.value.filter((p) => p.assetId !== entry.assetId)
    }
  } catch (err: unknown) {
    await handleFetchError(err)
  } finally {
    markingAllRentable.value = false
  }
}

// --- Labels: print one type's waiting units ---

const printingGroupId = ref<number | null>(null)

async function printEntries(units: { assetId: number; assetTypeId: number; tagCode: string }[]) {
  entries.value = await toSheetEntries(units)
  await nextTick()
  print()
}

async function printGroupSheet(assetTypeId: number) {
  errorCode.value = null
  errorMessage.value = null
  printingGroupId.value = assetTypeId
  try {
    await printEntries(pending.value.filter((p) => p.assetTypeId === assetTypeId))
  } finally {
    printingGroupId.value = null
  }
}

// --- Cancel a registration made by mistake (never-activated units only) ---

const cancelTarget = ref<{ assetIds: number[]; body: string } | null>(null)
const cancelling = ref(false)

function askCancelOne(entry: PendingActivationEntry) {
  cancelTarget.value = {
    assetIds: [entry.assetId],
    body: sk.adminAssetRegistry.cancelConfirmOne.replace('{tag}', entry.tagCode),
  }
}

function askCancelGroup(group: { name: string; entries: PendingActivationEntry[] }) {
  const ids = group.entries.filter((e) => e.neverActivated).map((e) => e.assetId)
  cancelTarget.value = {
    assetIds: ids,
    body: sk.adminAssetRegistry.cancelConfirmGroup
      .replace('{count}', String(ids.length))
      .replace('{name}', group.name),
  }
}

async function confirmCancel() {
  if (!cancelTarget.value) return
  errorCode.value = null
  errorMessage.value = null
  cancelling.value = true
  try {
    for (const assetId of cancelTarget.value.assetIds) {
      await $fetch(`/api/asset-registry/assets/${assetId}/cancel-registration`, { method: 'POST' })
      pending.value = pending.value.filter((p) => p.assetId !== assetId)
    }
    cancelTarget.value = null
  } catch (err: unknown) {
    cancelTarget.value = null
    await handleFetchError(err)
  } finally {
    cancelling.value = false
  }
}

// --- Reprint: any tagged unit's label again, same code (FR-26) ---

const tagged = ref<TaggedAssetEntry[] | null>(null)
const reprintTypeId = ref<number | null>(null)
const reprintSelected = ref<number[]>([])
const reprinting = ref(false)

// ALL_TYPES lists every tagged unit at once: the first labels for a whole
// catalog registered without printing them.
const ALL_TYPES = -1
const reprintUnits = computed(() => {
  if (reprintTypeId.value === null) return []
  const all = tagged.value ?? []
  return reprintTypeId.value === ALL_TYPES ? all : all.filter((t) => t.assetTypeId === reprintTypeId.value)
})

async function loadTagged() {
  try {
    tagged.value = await $fetch<TaggedAssetEntry[]>('/api/asset-registry/assets/tagged')
  } catch (err: unknown) {
    await handleFetchError(err)
  }
}

watch(reprintTypeId, async () => {
  reprintSelected.value = []
  if (tagged.value === null) await loadTagged()
})

function selectAllReprint() {
  reprintSelected.value = reprintUnits.value.map((u) => u.assetId)
}

async function reprintSelectedLabels() {
  errorCode.value = null
  errorMessage.value = null
  reprinting.value = true
  try {
    await printEntries(reprintUnits.value.filter((u) => reprintSelected.value.includes(u.assetId)))
  } finally {
    reprinting.value = false
  }
}

async function markGroupRentable(assetTypeId: number) {
  errorCode.value = null
  errorMessage.value = null
  markingGroupId.value = assetTypeId
  try {
    for (const entry of pending.value.filter((p) => p.assetTypeId === assetTypeId)) {
      await $fetch(`/api/asset-registry/assets/${entry.assetId}/mark-rentable`, { method: 'POST' })
      pending.value = pending.value.filter((p) => p.assetId !== entry.assetId)
    }
  } catch (err: unknown) {
    await handleFetchError(err)
  } finally {
    markingGroupId.value = null
  }
}

await loadAssetTypes()
await loadPending()
</script>

<template>
  <main class="admin-asset-registry">
    <h1 class="no-print">{{ sk.adminAssetRegistry.title }}</h1>
    <p class="no-print">{{ sk.adminAssetRegistry.intro }}</p>
    <AppAlert class="no-print" :code="errorCode" :message="errorMessage" />

    <section class="no-print admin-asset-registry__builder">
      <h2>{{ sk.adminAssetRegistry.builderHeading }}</h2>
      <EmptyState v-if="assetTypes.length === 0" :message="sk.adminAssetRegistry.noAssetTypes" />
      <template v-else>
        <div class="admin-asset-registry__builder-row">
          <AppField :label="sk.adminAssetRegistry.assetTypeLabel">
            <template #default="slotProps">
              <select :id="slotProps.id" v-model.number="selectedAssetTypeId">
                <option v-for="assetType in assetTypes" :key="assetType.id" :value="assetType.id">
                  {{ assetType.name }}
                </option>
              </select>
            </template>
          </AppField>
          <AppField :label="sk.adminAssetRegistry.quantityLabel">
            <template #default="slotProps">
              <input :id="slotProps.id" v-model="quantityInput" type="number" min="1" step="1" />
            </template>
          </AppField>
          <AppButton variant="secondary" @click="addLine">{{ sk.adminAssetRegistry.addLineAction }}</AppButton>
        </div>

        <AppTable v-if="lines.length > 0">
          <thead>
            <tr>
              <th>{{ sk.adminAssetRegistry.columnAssetType }}</th>
              <th>{{ sk.adminAssetRegistry.columnQuantity }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(line, index) in lines" :key="line.assetTypeId">
              <td>{{ line.assetTypeName }}</td>
              <td>{{ line.quantity }}</td>
              <td>
                <AppButton variant="quiet" @click="removeLine(index)">{{ sk.adminAssetRegistry.removeLineAction }}</AppButton>
              </td>
            </tr>
          </tbody>
        </AppTable>
      </template>

      <details>
        <summary>{{ sk.adminAssetRegistry.advancedToggle }}</summary>
        <AppField :label="sk.adminAssetRegistry.csvFileLabel">
          <template #default="slotProps">
            <input :id="slotProps.id" type="file" accept=".csv,text/csv" @change="onFileChange" />
          </template>
        </AppField>
        <AppField :label="sk.adminAssetRegistry.csvTextareaLabel">
          <template #default="slotProps">
            <textarea :id="slotProps.id" v-model="csv" rows="6" placeholder="assetTypeId,quantity&#10;1,50&#10;2,20"></textarea>
          </template>
        </AppField>
      </details>

      <AppButton variant="primary" size="counter" :pending="submitting" @click="submit">
        {{ submitting ? sk.adminAssetRegistry.submitting : sk.adminAssetRegistry.submitAction }}
      </AppButton>
    </section>

    <section v-if="pending.length > 0" class="no-print">
      <h2>{{ sk.adminAssetRegistry.pendingHeading }}</h2>
      <p>{{ sk.adminAssetRegistry.pendingIntro }}</p>
      <div class="admin-asset-registry__pending-actions">
        <AppButton
          variant="secondary"
          :disabled="markingAny && !markingAllRentable"
          :pending="markingAllRentable"
          @click="markAllRentable"
        >
          {{ markingAllRentable ? sk.adminAssetRegistry.markingRentable : sk.adminAssetRegistry.markAllRentableAction }}
        </AppButton>
        <AppButton variant="secondary" :pending="preparingPendingSheet" @click="printPendingSheet">
          {{ preparingPendingSheet ? sk.adminAssetRegistry.preparingSheet : sk.adminAssetRegistry.printPendingAction }}
        </AppButton>
      </div>
      <div class="admin-asset-registry__groups">
        <article v-for="group in pendingGroups" :key="group.assetTypeId" class="admin-asset-registry__group">
          <header class="admin-asset-registry__group-head">
            <h3 class="admin-asset-registry__group-name">
              {{ group.name }}
              <span class="admin-asset-registry__group-count">
                {{ sk.adminAssetRegistry.groupCount.replace('{count}', String(group.entries.length)) }}
              </span>
            </h3>
            <span class="admin-asset-registry__group-actions">
            <AppButton
              variant="quiet"
              :pending="printingGroupId === group.assetTypeId"
              @click="printGroupSheet(group.assetTypeId)"
            >
              {{ sk.adminAssetRegistry.printGroupAction }}
            </AppButton>
            <AppButton
              v-if="group.entries.some((e) => e.neverActivated)"
              variant="quiet"
              class="admin-asset-registry__cancel"
              :disabled="markingAny || cancelling"
              @click="askCancelGroup(group)"
            >
              {{
                sk.adminAssetRegistry.cancelGroupAction.replace(
                  '{count}',
                  String(group.entries.filter((e) => e.neverActivated).length),
                )
              }}
            </AppButton>
            <AppButton
              variant="secondary"
              :disabled="markingAny && markingGroupId !== group.assetTypeId"
              :pending="markingGroupId === group.assetTypeId"
              @click="markGroupRentable(group.assetTypeId)"
            >
              {{
                markingGroupId === group.assetTypeId
                  ? sk.adminAssetRegistry.markingRentable
                  : sk.adminAssetRegistry.markGroupAction.replace('{count}', String(group.entries.length))
              }}
            </AppButton>
            </span>
          </header>
          <ul class="admin-asset-registry__units">
            <li v-for="entry in group.entries" :key="entry.assetId" class="admin-asset-registry__unit">
              <TagCodePlate>{{ entry.tagCode }}</TagCodePlate>
              <AppButton
                variant="quiet"
                :aria-label="sk.adminAssetRegistry.markOneLabel.replace('{tag}', entry.tagCode)"
                :disabled="markingAny && markingRentableAssetId !== entry.assetId"
                :pending="markingRentableAssetId === entry.assetId"
                @click="markRentable(entry.assetId)"
              >
                {{ sk.adminAssetRegistry.markOneAction }}
              </AppButton>
              <AppButton
                v-if="entry.neverActivated"
                variant="quiet"
                class="admin-asset-registry__cancel"
                :aria-label="sk.adminAssetRegistry.cancelOneLabel.replace('{tag}', entry.tagCode)"
                :disabled="markingAny || cancelling"
                @click="askCancelOne(entry)"
              >
                {{ sk.adminAssetRegistry.cancelOneAction }}
              </AppButton>
            </li>
          </ul>
        </article>
      </div>
    </section>
    <EmptyState v-else class="no-print" :message="sk.adminAssetRegistry.pendingEmpty" />

    <section class="no-print admin-asset-registry__reprint">
      <h2>{{ sk.adminAssetRegistry.reprintHeading }}</h2>
      <p>{{ sk.adminAssetRegistry.reprintIntro }}</p>
      <AppField :label="sk.adminAssetRegistry.reprintTypeLabel">
        <template #default="slotProps">
          <select :id="slotProps.id" v-model.number="reprintTypeId">
            <option :value="null">{{ sk.adminAssetRegistry.reprintChoose }}</option>
            <option :value="ALL_TYPES">{{ sk.adminAssetRegistry.reprintAllTypes }}</option>
            <option v-for="assetType in assetTypes" :key="assetType.id" :value="assetType.id">
              {{ assetType.name }}
            </option>
          </select>
        </template>
      </AppField>
      <template v-if="reprintTypeId !== null && tagged !== null">
        <EmptyState v-if="reprintUnits.length === 0" :message="sk.adminAssetRegistry.reprintEmpty" />
        <template v-else>
          <ul class="admin-asset-registry__units admin-asset-registry__reprint-units">
            <li v-for="unit in reprintUnits" :key="unit.assetId">
              <label class="admin-asset-registry__reprint-unit">
                <input v-model="reprintSelected" type="checkbox" :value="unit.assetId" />
                <TagCodePlate>{{ unit.tagCode }}</TagCodePlate>
                <span v-if="reprintTypeId === ALL_TYPES" class="admin-asset-registry__unit-type">{{ assetTypeName(unit.assetTypeId) }}</span>
                <span class="admin-asset-registry__unit-status">{{ sk.adminAssetRegistry.assetStatus[unit.status] }}</span>
              </label>
            </li>
          </ul>
          <div class="admin-asset-registry__pending-actions">
            <AppButton variant="quiet" @click="selectAllReprint">{{ sk.adminAssetRegistry.reprintSelectAll }}</AppButton>
            <AppButton
              variant="primary"
              :pending="reprinting"
              :disabled="reprintSelected.length === 0"
              @click="reprintSelectedLabels"
            >
              {{ sk.adminAssetRegistry.reprintAction.replace('{count}', String(reprintSelected.length)) }}
            </AppButton>
          </div>
        </template>
      </template>
    </section>

    <ConfirmAction
      :open="cancelTarget !== null"
      :title-text="sk.adminAssetRegistry.cancelConfirmTitle"
      :body-text="cancelTarget?.body ?? ''"
      :confirm-label="sk.adminAssetRegistry.cancelConfirmAction"
      :pending="cancelling"
      @confirm="confirmCancel"
      @close="cancelTarget = null"
    />

    <section v-if="entries.length > 0" class="admin-asset-registry__sheets">
      <h2 class="no-print">{{ sk.adminAssetRegistry.resultHeading }}</h2>
      <p class="no-print">
        {{ sk.adminAssetRegistry.resultCount.replace('{count}', String(entries.length)) }}
        {{ sk.adminAssetRegistry.printHint }}
      </p>
      <p class="no-print">
        <AppButton variant="primary" @click="print">{{ sk.adminAssetRegistry.printAction }}</AppButton>
      </p>

      <AssetTagSheet :entries="entries" />
    </section>
  </main>
</template>

<style scoped>
.admin-asset-registry {
  max-width: 900px;
  margin: 0 auto;
  padding: var(--ht-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-6);
}

.admin-asset-registry__builder {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-3);
}

/* Wraps on a phone, where the type's long names would otherwise push the
 * row past the screen. */
.admin-asset-registry__builder-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0 var(--ht-space-3);
}

.admin-asset-registry__builder-row > :first-child {
  flex: 1 1 260px;
  min-width: 0;
}

.admin-asset-registry__builder-row select {
  width: 100%;
  min-width: 0;
}

.admin-asset-registry__builder-row > :nth-child(2) {
  flex: 0 1 140px;
}

.admin-asset-registry__builder-row > .app-button {
  margin-bottom: var(--ht-space-4);
}

.admin-asset-registry__groups {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-3);
  margin-top: var(--ht-space-3);
}

.admin-asset-registry__group {
  padding: var(--ht-space-3) var(--ht-space-4);
  border: 1px solid var(--ht-line);
  border-radius: var(--ht-radius-card);
  background: var(--ht-surface);
}

.admin-asset-registry__group-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ht-space-2);
}

.admin-asset-registry__group-name {
  margin: 0;
  font-size: var(--ht-text-3);
}

.admin-asset-registry__group-count {
  margin-left: var(--ht-space-1);
  color: var(--ht-ink-muted);
  font-weight: 400;
}

.admin-asset-registry__units {
  list-style: none;
  margin: var(--ht-space-2) 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--ht-space-1) var(--ht-space-3);
}

.admin-asset-registry__unit {
  display: inline-flex;
  align-items: center;
  gap: var(--ht-space-1);
}

.admin-asset-registry__group-actions {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ht-space-1);
}

.admin-asset-registry__cancel {
  color: var(--ht-danger);
}

.admin-asset-registry__reprint {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-2);
}

.admin-asset-registry__reprint p {
  margin: 0;
}

.admin-asset-registry__reprint-units {
  margin: 0;
}

.admin-asset-registry__reprint-unit {
  display: inline-flex;
  align-items: center;
  gap: var(--ht-space-2);
  min-height: var(--ht-hit-min);
  padding: 0 var(--ht-space-2);
  border: 1px solid var(--ht-line);
  border-radius: var(--ht-radius-card);
  background: var(--ht-surface);
  cursor: pointer;
}

.admin-asset-registry__reprint-unit input {
  width: var(--ht-space-5);
  height: var(--ht-space-5);
  margin: 0;
}

.admin-asset-registry__unit-type {
  font-size: var(--ht-text-2);
}

.admin-asset-registry__unit-status {
  font-size: var(--ht-text-2);
  color: var(--ht-ink-muted);
}

@media (max-width: 599px) {
  .admin-asset-registry {
    padding: var(--ht-space-4);
  }
}

.admin-asset-registry__pending-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ht-space-3);
}

.admin-asset-registry__sheets {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-3);
}

@media print {
  .no-print {
    display: none;
  }

  /* Only the sheets print, edge to edge: the @page margins in print.css
   * place the grid, so the page must add none of its own. */
  .admin-asset-registry {
    max-width: none;
    margin: 0;
    padding: 0;
    gap: 0;
  }
}
</style>
