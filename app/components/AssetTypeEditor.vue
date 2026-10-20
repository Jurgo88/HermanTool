<!-- S-19 AssetType editor (FR-37; D-54, D-55, D-56, D-57). Edits a copy
  and emits the PATCH body; the page sends it and owns the four states.
  Prices are entered in euros and sent in minor units with their currency
  (D-21). The image is chosen from the files that shipped (D-56), never
  uploaded. Becoming an Accessory hides the AssetType from S-01, and the
  form says so before saving. -->
<script setup lang="ts">
import { sk } from '~/i18n/sk'

export interface EditableAssetType {
  id: number
  name: string
  description: string
  dayRate: { amount: number; currency: string }
  depositAmount: { amount: number; currency: string }
  powerSourceId: number | null
  useAreaIds: number[]
  specifications: { label: string; value: string }[]
  includedContents: string
  handlingNotice: string
  imageFile: string | null
  principalIds: number[]
}

const props = defineProps<{
  assetType: EditableAssetType
  powerSources: { id: number; label: string }[]
  useAreas: { id: number; label: string }[]
  images: readonly string[]
  // AssetTypes that may be a principal: not this one, not an Accessory.
  principalCandidates: { id: number; name: string }[]
}>()

const emit = defineEmits<{
  save: [body: Record<string, unknown>]
  'dirty-change': [dirty: boolean]
}>()

const toEuros = (amount: number) => (amount / 100).toFixed(2)
const toMinorUnits = (euros: string) => Math.round(Number(euros) * 100)

const initialForm = {
  name: props.assetType.name,
  description: props.assetType.description,
  dayRateEuros: toEuros(props.assetType.dayRate.amount),
  depositEuros: toEuros(props.assetType.depositAmount.amount),
  powerSourceId: props.assetType.powerSourceId,
  useAreaIds: [...props.assetType.useAreaIds],
  specifications: props.assetType.specifications.map((spec) => ({ ...spec })),
  includedContents: props.assetType.includedContents,
  handlingNotice: props.assetType.handlingNotice,
  imageFile: props.assetType.imageFile,
  principalIds: [...props.assetType.principalIds],
}

const form = reactive({
  ...initialForm,
  useAreaIds: [...initialForm.useAreaIds],
  specifications: initialForm.specifications.map((specification) => ({ ...specification })),
  principalIds: [...initialForm.principalIds],
})

type EditorSection = 'basics' | 'classification' | 'content' | 'image'

const editorSections = computed(() => [
  { id: 'basics' as const, label: sk.adminCatalog.editorSections.basics },
  { id: 'classification' as const, label: sk.adminCatalog.editorSections.classification },
  { id: 'content' as const, label: sk.adminCatalog.editorSections.content },
  { id: 'image' as const, label: sk.adminCatalog.editorSections.image },
])
const activeSection = ref<EditorSection>('basics')
const principalSearch = ref('')

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

const filteredPrincipalCandidates = computed(() => {
  const query = fold(principalSearch.value.trim())

  return props.principalCandidates.filter((candidate) => fold(candidate.name).includes(query))
})

function selectSection(section: EditorSection) {
  activeSection.value = section
}

function onSectionKeydown(event: KeyboardEvent, current: EditorSection) {
  const currentIndex = editorSections.value.findIndex((section) => section.id === current)
  let next: EditorSection | undefined

  if (event.key === 'ArrowRight') {
    next = editorSections.value[(currentIndex + 1) % editorSections.value.length]?.id
  } else if (event.key === 'ArrowLeft') {
    next =
      editorSections.value[
        (currentIndex - 1 + editorSections.value.length) % editorSections.value.length
      ]?.id
  } else if (event.key === 'Home') {
    next = editorSections.value[0]?.id
  } else if (event.key === 'End') {
    next = editorSections.value[editorSections.value.length - 1]?.id
  }

  if (next) {
    event.preventDefault()
    activeSection.value = next
    nextTick(() => document.getElementById(`asset-type-editor-tab-${next}`)?.focus())
  }
}

const isDirty = computed(
  () =>
    form.name !== initialForm.name ||
    form.description !== initialForm.description ||
    form.dayRateEuros !== initialForm.dayRateEuros ||
    form.depositEuros !== initialForm.depositEuros ||
    form.powerSourceId !== initialForm.powerSourceId ||
    JSON.stringify(form.useAreaIds) !== JSON.stringify(initialForm.useAreaIds) ||
    JSON.stringify(form.specifications) !== JSON.stringify(initialForm.specifications) ||
    form.includedContents !== initialForm.includedContents ||
    form.handlingNotice !== initialForm.handlingNotice ||
    form.imageFile !== initialForm.imageFile ||
    JSON.stringify(form.principalIds) !== JSON.stringify(initialForm.principalIds),
)

watch(isDirty, (dirty) => emit('dirty-change', dirty), { immediate: true })

function addSpecification() {
  form.specifications.push({ label: '', value: '' })
}

function removeSpecification(index: number) {
  form.specifications.splice(index, 1)
}

function moveSpecification(index: number, delta: -1 | 1) {
  const target = index + delta
  if (target < 0 || target >= form.specifications.length) return
  const [moved] = form.specifications.splice(index, 1)
  form.specifications.splice(target, 0, moved!)
}

function isValidPrice(value: string) {
  const amount = Number(value)
  return (
    value.trim() !== '' && Number.isFinite(amount) && amount >= 0 && Number.isInteger(amount * 100)
  )
}

function save() {
  const invalidSection: EditorSection | null =
    !form.name || !isValidPrice(form.dayRateEuros) || !isValidPrice(form.depositEuros)
      ? 'basics'
      : form.specifications.some((specification) => !specification.label || !specification.value)
        ? 'content'
        : null

  if (invalidSection) {
    activeSection.value = invalidSection
    nextTick(() => {
      const formElement = document.getElementById('asset-type-editor-form')
      formElement
        ?.querySelector<HTMLInputElement | HTMLTextAreaElement>(':invalid')
        ?.reportValidity()
    })
    return
  }

  emit('save', {
    name: form.name,
    description: form.description,
    dayRate: { amount: toMinorUnits(form.dayRateEuros), currency: 'EUR' },
    depositAmount: { amount: toMinorUnits(form.depositEuros), currency: 'EUR' },
    powerSourceId: form.powerSourceId,
    useAreaIds: form.useAreaIds,
    specifications: form.specifications,
    includedContents: form.includedContents,
    handlingNotice: form.handlingNotice,
    imageFile: form.imageFile,
    principalIds: form.principalIds,
  })
}
</script>

<template>
  <form id="asset-type-editor-form" class="asset-type-editor" novalidate @submit.prevent="save">
    <p class="asset-type-editor__intro">{{ sk.adminCatalog.editorIntro }}</p>

    <div
      class="asset-type-editor__tabs"
      role="tablist"
      :aria-label="sk.adminCatalog.editorTabsLabel"
    >
      <button
        v-for="section in editorSections"
        :id="`asset-type-editor-tab-${section.id}`"
        :key="section.id"
        type="button"
        role="tab"
        class="asset-type-editor__tab"
        :aria-controls="`asset-type-editor-panel-${section.id}`"
        :aria-selected="activeSection === section.id"
        :tabindex="activeSection === section.id ? 0 : -1"
        @click="selectSection(section.id)"
        @keydown="onSectionKeydown($event, section.id)"
      >
        {{ section.label }}
      </button>
    </div>

    <section
      v-show="activeSection === 'basics'"
      id="asset-type-editor-panel-basics"
      class="asset-type-editor__panel"
      role="tabpanel"
      aria-labelledby="asset-type-editor-tab-basics"
      tabindex="0"
    >
      <div class="asset-type-editor__panel-heading">
        <span class="asset-type-editor__panel-mark" aria-hidden="true">01</span>
        <div>
          <h3>{{ sk.adminCatalog.sectionBasics }}</h3>
          <p>{{ sk.adminCatalog.editorSectionHints.basics }}</p>
        </div>
      </div>
      <fieldset class="asset-type-editor__fields">
        <AppField :label="sk.adminCatalog.fieldName">
          <template #default="slotProps">
            <input
              :id="slotProps.id"
              v-model="form.name"
              name="asset-type-name"
              type="text"
              required
            />
          </template>
        </AppField>
        <AppField :label="sk.adminCatalog.fieldDescription">
          <template #default="slotProps">
            <textarea :id="slotProps.id" v-model="form.description" rows="3" />
          </template>
        </AppField>
        <div class="asset-type-editor__price-fields">
          <AppField :label="sk.adminCatalog.fieldDayRate">
            <template #default="slotProps">
              <input
                :id="slotProps.id"
                v-model="form.dayRateEuros"
                type="number"
                min="0"
                step="0.01"
                required
              />
            </template>
          </AppField>
          <AppField :label="sk.adminCatalog.fieldDeposit">
            <template #default="slotProps">
              <input
                :id="slotProps.id"
                v-model="form.depositEuros"
                type="number"
                min="0"
                step="0.01"
                required
              />
            </template>
          </AppField>
        </div>
      </fieldset>
    </section>

    <section
      v-show="activeSection === 'classification'"
      id="asset-type-editor-panel-classification"
      class="asset-type-editor__panel"
      role="tabpanel"
      aria-labelledby="asset-type-editor-tab-classification"
      tabindex="0"
    >
      <div class="asset-type-editor__panel-heading">
        <span class="asset-type-editor__panel-mark" aria-hidden="true">02</span>
        <div>
          <h3>{{ sk.adminCatalog.sectionClassification }}</h3>
          <p>{{ sk.adminCatalog.editorSectionHints.classification }}</p>
        </div>
      </div>
      <div class="asset-type-editor__card">
        <AppField :label="sk.adminCatalog.fieldPowerSource">
          <template #default="slotProps">
            <select :id="slotProps.id" v-model="form.powerSourceId">
              <option :value="null">{{ sk.adminCatalog.noPowerSource }}</option>
              <option v-for="option in powerSources" :key="option.id" :value="option.id">
                {{ option.label }}
              </option>
            </select>
          </template>
        </AppField>
        <div
          class="asset-type-editor__checks"
          role="group"
          :aria-label="sk.adminCatalog.fieldUseAreas"
        >
          <span class="asset-type-editor__group-label">{{ sk.adminCatalog.fieldUseAreas }}</span>
          <label v-for="option in useAreas" :key="option.id">
            <input v-model="form.useAreaIds" type="checkbox" :value="option.id" />
            {{ option.label }}
          </label>
        </div>
      </div>
      <div class="asset-type-editor__card asset-type-editor__accessory">
        <div class="asset-type-editor__panel-heading">
          <span class="asset-type-editor__panel-mark" aria-hidden="true">+</span>
          <div>
            <h3>{{ sk.adminCatalog.sectionAccessory }}</h3>
            <p>{{ sk.adminCatalog.accessoryOfLabel }}</p>
          </div>
        </div>

        <div v-if="principalCandidates.length > 0" class="asset-type-editor__accessory-toolbar">
          <AppField :label="sk.adminCatalog.accessorySearchLabel">
            <template #default="slotProps">
              <input
                :id="slotProps.id"
                v-model="principalSearch"
                type="search"
                autocomplete="off"
              />
            </template>
          </AppField>
          <span class="asset-type-editor__selected-count" role="status" aria-live="polite">
            {{
              sk.adminCatalog.accessorySelectedCount.replace(
                '{count}',
                String(form.principalIds.length),
              )
            }}
          </span>
        </div>

        <p v-if="principalCandidates.length === 0" class="asset-type-editor__accessory-empty">
          {{ sk.adminCatalog.accessoryCandidatesEmpty }}
        </p>
        <p
          v-else-if="filteredPrincipalCandidates.length === 0"
          class="asset-type-editor__accessory-empty"
          role="status"
        >
          {{ sk.adminCatalog.accessorySearchEmpty }}
        </p>
        <div
          v-else
          class="asset-type-editor__checks asset-type-editor__checks--accessories"
          role="group"
          :aria-label="sk.adminCatalog.accessoryOfLabel"
        >
          <label
            v-for="candidate in filteredPrincipalCandidates"
            :key="candidate.id"
            class="asset-type-editor__accessory-option"
            :class="{
              'asset-type-editor__accessory-option--selected': form.principalIds.includes(
                candidate.id,
              ),
            }"
          >
            <input
              v-model="form.principalIds"
              class="asset-type-editor__accessory-checkbox"
              type="checkbox"
              :value="candidate.id"
            />
            <span class="asset-type-editor__accessory-name">{{ candidate.name }}</span>
          </label>
        </div>
        <AppAlert
          v-if="form.principalIds.length > 0"
          variant="info"
          :message="sk.adminCatalog.accessoryOfHint"
        />
      </div>
    </section>

    <section
      v-show="activeSection === 'content'"
      id="asset-type-editor-panel-content"
      class="asset-type-editor__panel"
      role="tabpanel"
      aria-labelledby="asset-type-editor-tab-content"
      tabindex="0"
    >
      <div class="asset-type-editor__panel-heading">
        <span class="asset-type-editor__panel-mark" aria-hidden="true">03</span>
        <div>
          <h3>{{ sk.adminCatalog.sectionContent }}</h3>
          <p>{{ sk.adminCatalog.editorSectionHints.content }}</p>
        </div>
      </div>
      <div class="asset-type-editor__card">
        <AppField :label="sk.adminCatalog.fieldIncludedContents">
          <template #default="slotProps">
            <input :id="slotProps.id" v-model="form.includedContents" type="text" />
          </template>
        </AppField>
        <AppField :label="sk.adminCatalog.fieldHandlingNotice">
          <template #default="slotProps">
            <input :id="slotProps.id" v-model="form.handlingNotice" type="text" />
          </template>
        </AppField>
      </div>
      <div class="asset-type-editor__card">
        <div class="asset-type-editor__panel-heading asset-type-editor__panel-heading--compact">
          <div>
            <h3>{{ sk.adminCatalog.specificationsHeading }}</h3>
            <p>{{ sk.adminCatalog.editorSpecificationsHint }}</p>
          </div>
        </div>
        <div
          v-for="(spec, index) in form.specifications"
          :key="index"
          class="asset-type-editor__spec"
        >
          <AppField :label="sk.adminCatalog.specificationLabel">
            <template #default="slotProps">
              <input :id="slotProps.id" v-model="spec.label" type="text" required />
            </template>
          </AppField>
          <AppField :label="sk.adminCatalog.specificationValue">
            <template #default="slotProps">
              <input :id="slotProps.id" v-model="spec.value" type="text" required />
            </template>
          </AppField>
          <div class="asset-type-editor__spec-actions">
            <button
              type="button"
              class="asset-type-editor__spec-move"
              :aria-label="sk.adminCatalog.moveUpAction"
              :title="sk.adminCatalog.moveUpAction"
              :disabled="index === 0"
              @click="moveSpecification(index, -1)"
            >
              <span aria-hidden="true">{{ sk.adminClassification.moveUpGlyph }}</span>
            </button>
            <button
              type="button"
              class="asset-type-editor__spec-move"
              :aria-label="sk.adminCatalog.moveDownAction"
              :title="sk.adminCatalog.moveDownAction"
              :disabled="index === form.specifications.length - 1"
              @click="moveSpecification(index, 1)"
            >
              <span aria-hidden="true">{{ sk.adminClassification.moveDownGlyph }}</span>
            </button>
            <AppButton variant="quiet" @click="removeSpecification(index)">
              {{ sk.adminCatalog.removeSpecificationAction }}
            </AppButton>
          </div>
        </div>
        <AppButton variant="secondary" @click="addSpecification">{{
          sk.adminCatalog.addSpecificationAction
        }}</AppButton>
      </div>
    </section>

    <section
      v-show="activeSection === 'image'"
      id="asset-type-editor-panel-image"
      class="asset-type-editor__panel"
      role="tabpanel"
      aria-labelledby="asset-type-editor-tab-image"
      tabindex="0"
    >
      <div class="asset-type-editor__panel-heading">
        <span class="asset-type-editor__panel-mark" aria-hidden="true">04</span>
        <div>
          <h3>{{ sk.adminCatalog.sectionImage }}</h3>
          <p>{{ sk.adminCatalog.editorSectionHints.image }}</p>
        </div>
      </div>
      <div class="asset-type-editor__image-card">
        <div class="asset-type-editor__image-preview">
          <img v-if="form.imageFile" :src="`/catalog/${form.imageFile}`" alt="" />
          <span v-else>{{ sk.adminCatalog.imagePreviewEmpty }}</span>
        </div>
        <AppField :label="sk.adminCatalog.fieldImage">
          <template #default="slotProps">
            <select :id="slotProps.id" v-model="form.imageFile">
              <option :value="null">{{ sk.adminCatalog.noImage }}</option>
              <option v-for="file in images" :key="file" :value="file">{{ file }}</option>
            </select>
          </template>
        </AppField>
      </div>
    </section>
  </form>
</template>

<style scoped>
.asset-type-editor {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-5);
}

.asset-type-editor__intro {
  margin: 0;
  padding: var(--ht-space-3) var(--ht-space-4);
  border-left: var(--ht-space-1) solid var(--ht-signal);
  border-radius: var(--ht-radius-plate);
  background: var(--ht-surface);
  color: var(--ht-ink-muted);
}

.asset-type-editor__tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ht-space-2);
}

.asset-type-editor__tab {
  min-height: var(--ht-hit-min);
  padding: var(--ht-space-2) var(--ht-space-3);
  border: var(--ht-line-width) solid var(--ht-line);
  border-radius: var(--ht-radius-card);
  background: var(--ht-surface);
  color: var(--ht-ink-muted);
  font-family: var(--ht-font-condensed);
  font-size: var(--ht-text-2);
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  transition:
    color var(--ht-motion),
    background-color var(--ht-motion),
    border-color var(--ht-motion),
    box-shadow var(--ht-motion);
}

.asset-type-editor__tab[aria-selected='true'] {
  border-color: var(--ht-ink);
  background: var(--ht-ink);
  color: var(--ht-paper);
  box-shadow: inset 0 calc(var(--ht-space-1) * -1) 0 var(--ht-signal);
}

.asset-type-editor__tab:focus-visible,
.asset-type-editor__panel:focus-visible {
  outline: var(--ht-focus-ring-width) solid var(--ht-signal-deep);
  outline-offset: var(--ht-focus-ring-offset);
}

.asset-type-editor__panel {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-4);
}

.asset-type-editor__panel-heading {
  display: flex;
  align-items: center;
  gap: var(--ht-space-3);
}

.asset-type-editor__panel-heading h3 {
  margin: 0;
  font-size: var(--ht-text-4);
}

.asset-type-editor__panel-heading p {
  margin: var(--ht-space-1) 0 0;
  color: var(--ht-ink-muted);
  font-size: var(--ht-text-2);
}

.asset-type-editor__panel-heading--compact {
  margin-bottom: var(--ht-space-3);
}

.asset-type-editor__panel-mark {
  flex: none;
  display: grid;
  place-items: center;
  width: var(--ht-space-6);
  height: var(--ht-space-6);
  border-radius: var(--ht-radius-card);
  background: var(--ht-signal);
  color: var(--ht-on-signal);
  font-family: var(--ht-font-mono);
  font-size: var(--ht-text-2);
  font-weight: 600;
}

.asset-type-editor__fields,
.asset-type-editor__card,
.asset-type-editor__image-card {
  min-width: 0;
  border: var(--ht-line-width) solid var(--ht-line);
  border-radius: var(--ht-radius-card);
  padding: var(--ht-space-4);
  background: var(--ht-surface);
}

.asset-type-editor__fields {
  min-inline-size: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 var(--ht-space-4);
}

.asset-type-editor__fields > :nth-child(1),
.asset-type-editor__fields > :nth-child(2),
.asset-type-editor__price-fields {
  grid-column: 1 / -1;
}

.asset-type-editor__price-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 var(--ht-space-4);
}

.asset-type-editor__card {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-3);
}

.asset-type-editor__group-label {
  font-family: var(--ht-font-condensed);
  font-weight: 600;
  font-size: var(--ht-text-2);
}

.asset-type-editor__checks {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ht-space-2) var(--ht-space-4);
  align-items: center;
}

.asset-type-editor__checks label {
  display: inline-flex;
  gap: var(--ht-space-1);
  align-items: center;
  min-height: var(--ht-hit-min);
}

.asset-type-editor__accessory-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ht-space-3);
}

.asset-type-editor__accessory-toolbar :deep(.app-field) {
  margin-bottom: 0;
}

.asset-type-editor__selected-count {
  color: var(--ht-ink-muted);
  font-size: var(--ht-text-2);
  font-weight: 600;
  white-space: nowrap;
}

.asset-type-editor__checks--accessories {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ht-space-2);
  align-items: stretch;
}

.asset-type-editor__accessory-option {
  grid-template-columns: var(--ht-control-check-size) minmax(0, 1fr);
  align-content: center;
  min-width: 0;
  min-height: var(--ht-hit-min);
  padding: var(--ht-space-2) var(--ht-space-3);
  border: var(--ht-line-width) solid var(--ht-line);
  border-radius: var(--ht-radius-card);
  background: var(--ht-paper);
  color: var(--ht-ink);
  font-size: var(--ht-text-3);
  cursor: pointer;
  transition:
    border-color var(--ht-motion),
    background-color var(--ht-motion),
    box-shadow var(--ht-motion);
}

.asset-type-editor__checks--accessories .asset-type-editor__accessory-option {
  display: grid;
  gap: var(--ht-space-3);
}

.asset-type-editor__accessory-option:hover {
  border-color: var(--ht-line-strong);
  background: var(--ht-surface-sunk);
}

.asset-type-editor__accessory-option--selected {
  border-color: var(--ht-signal-deep);
  background: var(--ht-surface-sunk);
  box-shadow: inset var(--ht-space-1) 0 0 var(--ht-signal);
}

.asset-type-editor__accessory-option:focus-within {
  outline: var(--ht-focus-ring-width) solid var(--ht-signal-deep);
  outline-offset: var(--ht-focus-ring-offset);
}

.asset-type-editor__accessory-checkbox {
  width: var(--ht-control-check-size);
  height: var(--ht-control-check-size);
  margin: 0;
  accent-color: var(--ht-signal-deep);
}

.asset-type-editor__accessory-name {
  min-width: 0;
  overflow-wrap: anywhere;
  font-weight: 600;
}

.asset-type-editor__accessory-empty {
  margin: 0;
  padding: var(--ht-space-4);
  border: var(--ht-line-width) dashed var(--ht-line-strong);
  border-radius: var(--ht-radius-card);
  color: var(--ht-ink-muted);
  text-align: center;
}

.asset-type-editor__spec {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  align-items: end;
  gap: var(--ht-space-2);
  padding-top: var(--ht-space-3);
  border-top: var(--ht-line-width) solid var(--ht-line);
}

.asset-type-editor__spec-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ht-space-1);
}

.asset-type-editor__spec :deep(.app-field) {
  margin-bottom: 0;
}

.asset-type-editor__spec-move {
  display: inline-grid;
  place-items: center;
  width: var(--ht-hit-min);
  height: var(--ht-hit-min);
  padding: 0;
  border: var(--ht-line-width) solid var(--ht-line-strong);
  border-radius: var(--ht-radius-card);
  background: var(--ht-surface);
  color: var(--ht-ink);
  font-family: var(--ht-font-sans);
  font-size: var(--ht-text-4);
  font-weight: 600;
  cursor: pointer;
}

.asset-type-editor__spec-move:hover:not(:disabled) {
  background: var(--ht-surface-sunk);
}

.asset-type-editor__spec-move:disabled {
  color: var(--ht-ink-muted);
  opacity: 0.45;
  cursor: not-allowed;
}

.asset-type-editor__spec-move:focus-visible {
  outline: var(--ht-focus-ring-width) solid var(--ht-signal-deep);
  outline-offset: var(--ht-focus-ring-offset);
}

.asset-type-editor__image-card {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  align-items: center;
  gap: var(--ht-space-5);
}

.asset-type-editor__image-preview {
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border-radius: var(--ht-radius-card);
  background: var(--ht-surface-sunk);
  color: var(--ht-ink-muted);
  text-align: center;
}

.asset-type-editor__image-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

@media (max-width: 719px) {
  .asset-type-editor__tabs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .asset-type-editor__fields,
  .asset-type-editor__price-fields,
  .asset-type-editor__image-card {
    grid-template-columns: minmax(0, 1fr);
  }

  .asset-type-editor__checks--accessories {
    grid-template-columns: minmax(0, 1fr);
  }

  .asset-type-editor__accessory-toolbar {
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
  }

  .asset-type-editor__spec {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .asset-type-editor__spec-actions {
    grid-column: 1 / -1;
    justify-content: flex-end;
  }
}

@media (prefers-reduced-motion: reduce) {
  .asset-type-editor__tab,
  .asset-type-editor__accessory-option {
    transition: none;
  }
}
</style>
