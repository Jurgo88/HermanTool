<!-- S-19 classification section (D-54, FR-37, FR-34). Maintains one list,
  PowerSource or UseArea, through /api/catalog/classification/:kind:
  add, rename, move, remove. Every change goes to the server and the list
  is re-read from its answer; nothing is shown as done before the server
  confirms it (§7.1). Removal of an entry in use is refused by the server,
  and the refusal names the AssetTypes in the way. -->
<script setup lang="ts">
import { sk } from '~/i18n/sk'
import { getErrorCode } from '~/utils/error-code'

interface Entry {
  id: number
  label: string
}

const props = defineProps<{ kind: 'power-sources' | 'use-areas'; heading: string }>()
const emit = defineEmits<{ changed: [] }>()

const base = `/api/catalog/classification/${props.kind}`
const requestFetch = useRequestFetch()

const entries = ref<Entry[]>([])
const errorCode = ref<string | null>(null)
const inUseBy = ref<string[]>([])
const pending = ref(false)
const newLabel = ref('')
const renamingId = ref<number | null>(null)
const renameLabel = ref('')

async function load() {
  entries.value = await requestFetch<Entry[]>(base)
}

async function run(action: () => Promise<unknown>) {
  errorCode.value = null
  inUseBy.value = []
  pending.value = true
  try {
    await action()
    await load()
    emit('changed')
    return true
  } catch (err: unknown) {
    errorCode.value = getErrorCode(err) ?? 'UNKNOWN'
    const names = (err as { data?: { data?: { assetTypeNames?: string[] } } })?.data?.data
      ?.assetTypeNames
    inUseBy.value = Array.isArray(names) ? names : []
    return false
  } finally {
    pending.value = false
  }
}

async function add() {
  const ok = await run(() => $fetch(base, { method: 'POST', body: { label: newLabel.value } }))
  if (ok) newLabel.value = ''
}

function startRename(entry: Entry) {
  renamingId.value = entry.id
  renameLabel.value = entry.label
}

async function saveRename() {
  if (renamingId.value === null) return
  const id = renamingId.value
  const ok = await run(() =>
    $fetch(`${base}/${id}`, { method: 'PATCH', body: { label: renameLabel.value } }),
  )
  if (ok) renamingId.value = null
}

async function move(index: number, delta: -1 | 1) {
  const sequence = entries.value.map((entry) => entry.id)
  const target = index + delta
  if (target < 0 || target >= sequence.length) return
  ;[sequence[index], sequence[target]] = [sequence[target]!, sequence[index]!]
  await run(() => $fetch(`${base}/reorder`, { method: 'POST', body: { sequence } }))
}

async function remove(entry: Entry) {
  await run(() => $fetch(`${base}/${entry.id}`, { method: 'DELETE' }))
}

await load()
</script>

<template>
  <section class="classification-list">
    <h3>{{ heading }}</h3>
    <AppAlert :code="errorCode" />
    <p v-if="inUseBy.length > 0" class="classification-list__in-use">
      {{ sk.adminClassification.inUseBy.replace('{names}', inUseBy.join(', ')) }}
    </p>

    <p v-if="entries.length === 0">{{ sk.adminClassification.empty }}</p>
    <ol v-else class="classification-list__entries">
      <li v-for="(entry, index) in entries" :key="entry.id" class="classification-list__entry">
        <template v-if="renamingId === entry.id">
          <AppField :label="sk.adminClassification.renameAction">
            <template #default="slotProps">
              <input :id="slotProps.id" v-model="renameLabel" type="text" required />
            </template>
          </AppField>
          <AppButton variant="primary" :pending="pending" @click="saveRename">
            {{ sk.adminClassification.saveAction }}
          </AppButton>
          <AppButton variant="quiet" @click="renamingId = null">{{
            sk.adminClassification.cancelAction
          }}</AppButton>
        </template>
        <template v-else>
          <span class="classification-list__label">{{ entry.label }}</span>
          <AppButton variant="quiet" :disabled="pending || index === 0" @click="move(index, -1)">
            {{ sk.adminClassification.moveUpAction }}
          </AppButton>
          <AppButton
            variant="quiet"
            :disabled="pending || index === entries.length - 1"
            @click="move(index, 1)"
          >
            {{ sk.adminClassification.moveDownAction }}
          </AppButton>
          <AppButton variant="secondary" :disabled="pending" @click="startRename(entry)">
            {{ sk.adminClassification.renameAction }}
          </AppButton>
          <AppButton variant="quiet" :disabled="pending" @click="remove(entry)">
            {{ sk.adminClassification.removeAction }}
          </AppButton>
        </template>
      </li>
    </ol>

    <form class="classification-list__new" @submit.prevent="add">
      <AppField :label="sk.adminClassification.newLabel">
        <template #default="slotProps">
          <input :id="slotProps.id" v-model="newLabel" type="text" required />
        </template>
      </AppField>
      <AppButton type="submit" variant="primary" :pending="pending">{{
        sk.adminClassification.addAction
      }}</AppButton>
    </form>
  </section>
</template>

<style scoped>
.classification-list {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-3);
}

.classification-list__entries {
  margin: 0;
  padding-left: var(--ht-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-1);
}

.classification-list__entry {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ht-space-2);
}

.classification-list__label {
  flex: 1 1 auto;
  font-weight: 600;
}

.classification-list__in-use {
  color: var(--ht-danger);
  font-size: var(--ht-text-2);
}

.classification-list__new {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--ht-space-3);
}
</style>
