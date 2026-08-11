<script setup lang="ts">
// Catalog admin surface (FR-37, A-09: low-frequency, distinct from the
// counter interaction). Every request goes through the Nitro routes
// under server/api/catalog/asset-types/*, which gate on requireOperator
// — a 401 here means the session is missing or expired, so this page
// sends the Operator back to /login rather than showing an error.
import { sk } from '~/i18n/sk'
import { formatMoney } from '~/utils/format'

definePageMeta({ layout: 'admin' })

interface AssetTypeView {
  id: number
  name: string
  description: string
  dayRate: { amount: number; currency: string }
  depositAmount: { amount: number; currency: string }
  published: boolean
}

// useNuxtApp()/useRequestFetch() must be called synchronously here, at
// the top of setup, before any `await` — that's the only point where
// Nuxt's composable context is guaranteed available. runWithContext()
// below re-establishes it inside the nested async catch handlers.
const nuxtApp = useNuxtApp()
const requestFetch = useRequestFetch()

const assetTypes = ref<AssetTypeView[]>([])
const error = ref<string | null>(null)

const form = reactive({
  name: '',
  description: '',
  dayRateEuros: '',
  depositEuros: '',
})

function toMinorUnits(euros: string): number {
  return Math.round(Number(euros) * 100)
}

async function load() {
  try {
    // useRequestFetch(), not plain $fetch: during SSR, plain $fetch
    // making an internal request to our own API does not forward the
    // browser's cookies, so the session-gated route would 401 on every
    // first load even when the Operator is genuinely signed in.
    // useRequestFetch() forwards them; on the client (no SSR involved)
    // it behaves like ordinary $fetch.
    assetTypes.value = await requestFetch<AssetTypeView[]>('/api/catalog/asset-types')
  } catch (err: unknown) {
    await handleFetchError(err)
  }
}

async function handleFetchError(err: unknown) {
  const statusCode = (err as { statusCode?: number })?.statusCode
  if (statusCode === 401) {
    // runWithContext: this runs inside a nested async catch handler,
    // where Nuxt's composable context (needed by navigateTo) isn't
    // reliably available otherwise — see the Nuxt app captured at the
    // top of setup.
    await nuxtApp.runWithContext(() => navigateTo('/login'))
    return
  }
  error.value = sk.common.somethingWentWrong
}

async function createAssetType() {
  error.value = null
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
    await load()
  } catch (err: unknown) {
    await handleFetchError(err)
  }
}

async function togglePublished(assetType: AssetTypeView) {
  error.value = null
  const action = assetType.published ? 'unpublish' : 'publish'
  try {
    await $fetch(`/api/catalog/asset-types/${assetType.id}/${action}`, { method: 'POST' })
    await load()
  } catch (err: unknown) {
    await handleFetchError(err)
  }
}

await load()
</script>

<template>
  <main>
    <h1>{{ sk.adminCatalog.title }}</h1>
    <p v-if="error" role="alert">{{ error }}</p>

    <section>
      <h2>{{ sk.adminCatalog.assetTypesHeading }}</h2>
      <table>
        <thead>
          <tr>
            <th>{{ sk.adminCatalog.columnName }}</th>
            <th>{{ sk.adminCatalog.columnDayRate }}</th>
            <th>{{ sk.adminCatalog.columnDeposit }}</th>
            <th>{{ sk.adminCatalog.columnPublished }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="assetType in assetTypes" :key="assetType.id">
            <td>{{ assetType.name }}</td>
            <td>{{ formatMoney(assetType.dayRate) }}</td>
            <td>{{ formatMoney(assetType.depositAmount) }}</td>
            <td>{{ assetType.published ? sk.adminCatalog.published : sk.adminCatalog.unpublished }}</td>
            <td>
              <button type="button" @click="togglePublished(assetType)">
                {{ assetType.published ? sk.adminCatalog.unpublishAction : sk.adminCatalog.publishAction }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section>
      <h2>{{ sk.adminCatalog.newHeading }}</h2>
      <form @submit.prevent="createAssetType">
        <label>
          {{ sk.adminCatalog.fieldName }}
          <input v-model="form.name" type="text" required />
        </label>
        <label>
          {{ sk.adminCatalog.fieldDescription }}
          <input v-model="form.description" type="text" />
        </label>
        <label>
          {{ sk.adminCatalog.fieldDayRate }}
          <input v-model="form.dayRateEuros" type="number" min="0" step="0.01" required />
        </label>
        <label>
          {{ sk.adminCatalog.fieldDeposit }}
          <input v-model="form.depositEuros" type="number" min="0" step="0.01" required />
        </label>
        <button type="submit">{{ sk.adminCatalog.createAction }}</button>
      </form>
    </section>
  </main>
</template>
