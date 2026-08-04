<script setup lang="ts">
// QR tag generation & 200-asset pilot bootstrap (F10, FR-25, FR-26, W9;
// issue #9). Posts a CSV of (assetTypeId, quantity) lines to
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
import QRCode from 'qrcode'
import { sk } from '~/i18n/sk'

interface AssetTypeOption {
  id: number
  name: string
}

interface BulkRegisteredUnitView {
  assetId: number
  assetTypeId: number
  tagCode: string
}

interface TagSheetEntry extends BulkRegisteredUnitView {
  qrDataUrl: string
}

interface PendingActivationEntry {
  assetId: number
  assetTypeId: number
  tagCode: string
  registeredAt: string
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
const error = ref<string | null>(null)
const submitting = ref(false)
const entries = ref<TagSheetEntry[]>([])

const pending = ref<PendingActivationEntry[]>([])
const markingRentableAssetId = ref<number | null>(null)
const markingAllRentable = ref(false)

function assetTypeName(assetTypeId: number): string {
  return assetTypes.value.find((a) => a.id === assetTypeId)?.name ?? String(assetTypeId)
}

async function handleFetchError(err: unknown) {
  const statusCode = (err as { statusCode?: number; data?: { statusMessage?: string } })?.statusCode
  if (statusCode === 401) {
    await nuxtApp.runWithContext(() => navigateTo('/login'))
    return
  }
  const message = (err as { data?: { statusMessage?: string } })?.data?.statusMessage
  error.value = message ?? sk.common.somethingWentWrong
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
  error.value = null
  const assetTypeId = selectedAssetTypeId.value
  const quantity = Number(quantityInput.value)
  if (!assetTypeId || !Number.isInteger(quantity) || quantity <= 0) {
    error.value = sk.adminAssetRegistry.invalidLineError
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
  error.value = null
  const body = buildCsv()
  if (!body.trim()) {
    error.value = sk.adminAssetRegistry.emptyCsvError
    return
  }

  submitting.value = true
  entries.value = []
  try {
    const { units } = await $fetch<{ units: BulkRegisteredUnitView[] }>('/api/asset-registry/bulk-register', {
      method: 'POST',
      body: { csv: body },
    })

    entries.value = await Promise.all(
      units.map(async (unit) => ({ ...unit, qrDataUrl: await QRCode.toDataURL(unit.tagCode, { margin: 1 }) })),
    )
    lines.value = []
    csv.value = ''
    await loadPending()
  } catch (err: unknown) {
    await handleFetchError(err)
  } finally {
    submitting.value = false
  }
}

function print() {
  window.print()
}

async function loadPending() {
  try {
    pending.value = await requestFetch<PendingActivationEntry[]>('/api/asset-registry/assets/pending-activation')
  } catch (err: unknown) {
    await handleFetchError(err)
  }
}

async function markRentable(assetId: number) {
  error.value = null
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
  error.value = null
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

await loadAssetTypes()
await loadPending()
</script>

<template>
  <main>
    <h1>{{ sk.adminAssetRegistry.title }}</h1>
    <p>{{ sk.adminAssetRegistry.intro }}</p>
    <p v-if="error" role="alert">{{ error }}</p>

    <section class="no-print">
      <h2>{{ sk.adminAssetRegistry.builderHeading }}</h2>
      <p v-if="assetTypes.length === 0">{{ sk.adminAssetRegistry.noAssetTypes }}</p>
      <template v-else>
        <label>
          {{ sk.adminAssetRegistry.assetTypeLabel }}
          <select v-model.number="selectedAssetTypeId">
            <option v-for="assetType in assetTypes" :key="assetType.id" :value="assetType.id">
              {{ assetType.name }}
            </option>
          </select>
        </label>
        <label>
          {{ sk.adminAssetRegistry.quantityLabel }}
          <input v-model="quantityInput" type="number" min="1" step="1" />
        </label>
        <button type="button" @click="addLine">{{ sk.adminAssetRegistry.addLineAction }}</button>

        <table v-if="lines.length > 0">
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
                <button type="button" @click="removeLine(index)">{{ sk.adminAssetRegistry.removeLineAction }}</button>
              </td>
            </tr>
          </tbody>
        </table>
      </template>

      <details>
        <summary>{{ sk.adminAssetRegistry.advancedToggle }}</summary>
        <label>
          {{ sk.adminAssetRegistry.csvFileLabel }}
          <input type="file" accept=".csv,text/csv" @change="onFileChange" />
        </label>
        <label>
          {{ sk.adminAssetRegistry.csvTextareaLabel }}
          <textarea v-model="csv" rows="6" placeholder="assetTypeId,quantity&#10;1,50&#10;2,20"></textarea>
        </label>
      </details>

      <p>
        <button type="button" :disabled="submitting" @click="submit">
          {{ submitting ? sk.adminAssetRegistry.submitting : sk.adminAssetRegistry.submitAction }}
        </button>
      </p>
    </section>

    <section v-if="pending.length > 0" class="no-print">
      <h2>{{ sk.adminAssetRegistry.pendingHeading }}</h2>
      <p>{{ sk.adminAssetRegistry.pendingIntro }}</p>
      <p>
        <button type="button" :disabled="markingAllRentable" @click="markAllRentable">
          {{ markingAllRentable ? sk.adminAssetRegistry.markingRentable : sk.adminAssetRegistry.markAllRentableAction }}
        </button>
      </p>
      <table>
        <thead>
          <tr>
            <th>{{ sk.adminAssetRegistry.columnAssetType }}</th>
            <th>{{ sk.adminAssetRegistry.columnTagCode }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in pending" :key="entry.assetId">
            <td>{{ assetTypeName(entry.assetTypeId) }}</td>
            <td>{{ entry.tagCode }}</td>
            <td>
              <button
                type="button"
                :disabled="markingRentableAssetId === entry.assetId || markingAllRentable"
                @click="markRentable(entry.assetId)"
              >
                {{
                  markingRentableAssetId === entry.assetId
                    ? sk.adminAssetRegistry.markingRentable
                    : sk.adminAssetRegistry.markRentableAction
                }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
    <p v-else class="no-print">{{ sk.adminAssetRegistry.pendingEmpty }}</p>

    <section v-if="entries.length > 0">
      <h2 class="no-print">{{ sk.adminAssetRegistry.resultHeading }}</h2>
      <p class="no-print">
        {{ sk.adminAssetRegistry.resultCount.replace('{count}', String(entries.length)) }}
        <button type="button" @click="print">{{ sk.adminAssetRegistry.printAction }}</button>
      </p>

      <div class="tag-sheet">
        <figure v-for="entry in entries" :key="entry.assetId" class="tag-card">
          <img :src="entry.qrDataUrl" :alt="entry.tagCode" width="160" height="160" />
          <figcaption>{{ entry.tagCode }}</figcaption>
        </figure>
      </div>
    </section>
  </main>
</template>

<style scoped>
.tag-sheet {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.tag-card {
  text-align: center;
  margin: 0;
}

@media print {
  .no-print {
    display: none;
  }
}
</style>
