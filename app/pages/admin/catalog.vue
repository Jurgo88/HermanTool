<script setup lang="ts">
// Catalog admin surface (FR-37, A-09: low-frequency, distinct from the
// counter interaction). Every request goes through the Nitro routes
// under server/api/catalog/asset-types/*, which gate on requireOperator
// — a 401 here means the session is missing or expired, so this page
// sends the Operator back to /login rather than showing an error.
interface AssetTypeView {
  id: number
  name: string
  description: string
  dayRate: { amount: number; currency: string }
  depositAmount: { amount: number; currency: string }
  published: boolean
}

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

function toEuros(minorUnits: number): string {
  return (minorUnits / 100).toFixed(2)
}

async function load() {
  try {
    assetTypes.value = await $fetch<AssetTypeView[]>('/api/catalog/asset-types')
  } catch (err: unknown) {
    await handleFetchError(err)
  }
}

async function handleFetchError(err: unknown) {
  const statusCode = (err as { statusCode?: number })?.statusCode
  if (statusCode === 401) {
    await navigateTo('/login')
    return
  }
  error.value = 'Something went wrong.'
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
    <h1>Catalog admin</h1>
    <p v-if="error" role="alert">{{ error }}</p>

    <section>
      <h2>AssetTypes</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Day rate</th>
            <th>Deposit</th>
            <th>Published</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="assetType in assetTypes" :key="assetType.id">
            <td>{{ assetType.name }}</td>
            <td>{{ toEuros(assetType.dayRate.amount) }} {{ assetType.dayRate.currency }}</td>
            <td>{{ toEuros(assetType.depositAmount.amount) }} {{ assetType.depositAmount.currency }}</td>
            <td>{{ assetType.published ? 'Published' : 'Unpublished' }}</td>
            <td>
              <button type="button" @click="togglePublished(assetType)">
                {{ assetType.published ? 'Unpublish' : 'Publish' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section>
      <h2>New AssetType</h2>
      <form @submit.prevent="createAssetType">
        <label>
          Name
          <input v-model="form.name" type="text" required />
        </label>
        <label>
          Description
          <input v-model="form.description" type="text" />
        </label>
        <label>
          Day rate (EUR)
          <input v-model="form.dayRateEuros" type="number" min="0" step="0.01" required />
        </label>
        <label>
          Deposit (EUR)
          <input v-model="form.depositEuros" type="number" min="0" step="0.01" required />
        </label>
        <button type="submit">Create</button>
      </form>
    </section>
  </main>
</template>
