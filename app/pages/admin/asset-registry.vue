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
import QRCode from 'qrcode'
import { sk } from '~/i18n/sk'

interface BulkRegisteredUnitView {
  assetId: number
  assetTypeId: number
  tagCode: string
}

interface TagSheetEntry extends BulkRegisteredUnitView {
  qrDataUrl: string
}

const nuxtApp = useNuxtApp()
const csv = ref('')
const error = ref<string | null>(null)
const submitting = ref(false)
const entries = ref<TagSheetEntry[]>([])

async function handleFetchError(err: unknown) {
  const statusCode = (err as { statusCode?: number; data?: { statusMessage?: string } })?.statusCode
  if (statusCode === 401) {
    await nuxtApp.runWithContext(() => navigateTo('/login'))
    return
  }
  const message = (err as { data?: { statusMessage?: string } })?.data?.statusMessage
  error.value = message ?? sk.common.somethingWentWrong
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  csv.value = await file.text()
}

async function submit() {
  error.value = null
  if (!csv.value.trim()) {
    error.value = sk.adminAssetRegistry.emptyCsvError
    return
  }

  submitting.value = true
  entries.value = []
  try {
    const { units } = await $fetch<{ units: BulkRegisteredUnitView[] }>('/api/asset-registry/bulk-register', {
      method: 'POST',
      body: { csv: csv.value },
    })

    entries.value = await Promise.all(
      units.map(async (unit) => ({ ...unit, qrDataUrl: await QRCode.toDataURL(unit.tagCode, { margin: 1 }) })),
    )
  } catch (err: unknown) {
    await handleFetchError(err)
  } finally {
    submitting.value = false
  }
}

function print() {
  window.print()
}
</script>

<template>
  <main>
    <h1>{{ sk.adminAssetRegistry.title }}</h1>
    <p>{{ sk.adminAssetRegistry.intro }}</p>
    <p v-if="error" role="alert">{{ error }}</p>

    <section class="no-print">
      <label>
        {{ sk.adminAssetRegistry.csvFileLabel }}
        <input type="file" accept=".csv,text/csv" @change="onFileChange" />
      </label>
      <label>
        {{ sk.adminAssetRegistry.csvTextareaLabel }}
        <textarea v-model="csv" rows="8" placeholder="assetTypeId,quantity&#10;1,50&#10;2,20"></textarea>
      </label>
      <button type="button" :disabled="submitting" @click="submit">
        {{ submitting ? sk.adminAssetRegistry.submitting : sk.adminAssetRegistry.submitAction }}
      </button>
    </section>

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
