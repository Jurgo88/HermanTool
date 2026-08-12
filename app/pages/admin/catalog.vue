<script setup lang="ts">
// Catalog admin surface (FR-01, FR-37, S-19; A-09: low-frequency, distinct
// from the counter interaction). Every request goes through the Nitro
// routes under server/api/catalog/asset-types/*, which gate on
// requireOperator — a 401 here means the session is missing or expired,
// so this page sends the Operator back to /login rather than showing an
// error.
//
// Editing (PATCH .../:id) reuses the existing route with no changes —
// this page's only job was giving it a UI. Unpublish goes through
// ConfirmAction (C-19): unpublishing something a Visitor is currently
// looking at deserves a confirmation; publish does not, since it is
// never disruptive to anyone already browsing.
import { sk } from '~/i18n/sk'
import { getErrorCode } from '~/utils/error-code'

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
const errorCode = ref<string | null>(null)

const form = reactive({
  name: '',
  description: '',
  dayRateEuros: '',
  depositEuros: '',
})

function toMinorUnits(euros: string): number {
  return Math.round(Number(euros) * 100)
}

function toEuros(amount: number): string {
  return (amount / 100).toFixed(2)
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
  errorCode.value = getErrorCode(err) ?? 'UNKNOWN'
}

async function createAssetType() {
  errorCode.value = null
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

async function publish(assetType: AssetTypeView) {
  errorCode.value = null
  try {
    await $fetch(`/api/catalog/asset-types/${assetType.id}/publish`, { method: 'POST' })
    await load()
  } catch (err: unknown) {
    await handleFetchError(err)
  }
}

const unpublishTarget = ref<AssetTypeView | null>(null)
const showUnpublishConfirm = ref(false)
const unpublishing = ref(false)

function startUnpublish(assetType: AssetTypeView) {
  unpublishTarget.value = assetType
  showUnpublishConfirm.value = true
}

async function confirmUnpublish() {
  if (!unpublishTarget.value) return
  errorCode.value = null
  unpublishing.value = true
  try {
    await $fetch(`/api/catalog/asset-types/${unpublishTarget.value.id}/unpublish`, { method: 'POST' })
    showUnpublishConfirm.value = false
    unpublishTarget.value = null
    await load()
  } catch (err: unknown) {
    await handleFetchError(err)
  } finally {
    unpublishing.value = false
  }
}

const editingId = ref<number | null>(null)
const editForm = reactive({ name: '', description: '', dayRateEuros: '', depositEuros: '' })
const savingEdit = ref(false)

function startEdit(assetType: AssetTypeView) {
  editingId.value = assetType.id
  editForm.name = assetType.name
  editForm.description = assetType.description
  editForm.dayRateEuros = toEuros(assetType.dayRate.amount)
  editForm.depositEuros = toEuros(assetType.depositAmount.amount)
}

function cancelEdit() {
  editingId.value = null
}

async function saveEdit() {
  if (editingId.value === null) return
  errorCode.value = null
  savingEdit.value = true
  try {
    await $fetch(`/api/catalog/asset-types/${editingId.value}`, {
      method: 'PATCH',
      body: {
        name: editForm.name,
        description: editForm.description,
        dayRate: { amount: toMinorUnits(editForm.dayRateEuros), currency: 'EUR' },
        depositAmount: { amount: toMinorUnits(editForm.depositEuros), currency: 'EUR' },
      },
    })
    editingId.value = null
    await load()
  } catch (err: unknown) {
    await handleFetchError(err)
  } finally {
    savingEdit.value = false
  }
}

await load()
</script>

<template>
  <main class="admin-catalog">
    <h1>{{ sk.adminCatalog.title }}</h1>
    <AppAlert :code="errorCode" />

    <section>
      <h2>{{ sk.adminCatalog.assetTypesHeading }}</h2>
      <AppTable>
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
          <template v-for="assetType in assetTypes" :key="assetType.id">
            <tr v-if="editingId !== assetType.id">
              <td>{{ assetType.name }}</td>
              <td><MoneyAmount :amount="assetType.dayRate" /></td>
              <td><MoneyAmount :amount="assetType.depositAmount" /></td>
              <td>
                <StateChip
                  :tone="assetType.published ? 'confirmed' : 'neutral'"
                  :label="assetType.published ? sk.adminCatalog.published : sk.adminCatalog.unpublished"
                />
              </td>
              <td class="admin-catalog__actions">
                <AppButton variant="secondary" @click="startEdit(assetType)">{{ sk.adminCatalog.editAction }}</AppButton>
                <AppButton v-if="!assetType.published" variant="primary" @click="publish(assetType)">
                  {{ sk.adminCatalog.publishAction }}
                </AppButton>
                <AppButton v-else variant="danger" @click="startUnpublish(assetType)">
                  {{ sk.adminCatalog.unpublishAction }}
                </AppButton>
              </td>
            </tr>
            <tr v-else>
              <td colspan="5">
                <form class="admin-catalog__edit-form" @submit.prevent="saveEdit">
                  <AppField :label="sk.adminCatalog.fieldName">
                    <template #default="slotProps">
                      <input :id="slotProps.id" v-model="editForm.name" type="text" required />
                    </template>
                  </AppField>
                  <AppField :label="sk.adminCatalog.fieldDescription">
                    <template #default="slotProps">
                      <input :id="slotProps.id" v-model="editForm.description" type="text" />
                    </template>
                  </AppField>
                  <AppField :label="sk.adminCatalog.fieldDayRate">
                    <template #default="slotProps">
                      <input :id="slotProps.id" v-model="editForm.dayRateEuros" type="number" min="0" step="0.01" required />
                    </template>
                  </AppField>
                  <AppField :label="sk.adminCatalog.fieldDeposit">
                    <template #default="slotProps">
                      <input :id="slotProps.id" v-model="editForm.depositEuros" type="number" min="0" step="0.01" required />
                    </template>
                  </AppField>
                  <div class="admin-catalog__edit-actions">
                    <AppButton type="submit" variant="primary" :pending="savingEdit">
                      {{ savingEdit ? sk.adminCatalog.saving : sk.adminCatalog.saveAction }}
                    </AppButton>
                    <AppButton type="button" variant="quiet" @click="cancelEdit">{{ sk.adminCatalog.cancelAction }}</AppButton>
                  </div>
                </form>
              </td>
            </tr>
          </template>
        </tbody>
      </AppTable>
    </section>

    <section>
      <h2>{{ sk.adminCatalog.newHeading }}</h2>
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
        <AppButton type="submit" variant="primary">{{ sk.adminCatalog.createAction }}</AppButton>
      </form>
    </section>

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
  max-width: 900px;
  margin: 0 auto;
  padding: var(--ht-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-6);
}

.admin-catalog__actions {
  display: flex;
  gap: var(--ht-space-2);
}

.admin-catalog__edit-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--ht-space-3);
  padding: var(--ht-space-3) 0;
}

.admin-catalog__edit-actions {
  display: flex;
  gap: var(--ht-space-2);
}

.admin-catalog__new-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--ht-space-3);
}
</style>
