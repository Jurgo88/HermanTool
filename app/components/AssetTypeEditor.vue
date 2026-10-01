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
  pending: boolean
}>()

const emit = defineEmits<{ save: [body: Record<string, unknown>]; cancel: [] }>()

const toEuros = (amount: number) => (amount / 100).toFixed(2)
const toMinorUnits = (euros: string) => Math.round(Number(euros) * 100)

const form = reactive({
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
})

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

function save() {
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
  <form class="asset-type-editor" @submit.prevent="save">
    <fieldset>
      <legend>{{ sk.adminCatalog.sectionBasics }}</legend>
      <AppField :label="sk.adminCatalog.fieldName">
        <template #default="slotProps">
          <input :id="slotProps.id" v-model="form.name" type="text" required />
        </template>
      </AppField>
      <AppField :label="sk.adminCatalog.fieldDescription">
        <template #default="slotProps">
          <textarea :id="slotProps.id" v-model="form.description" rows="3" />
        </template>
      </AppField>
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
    </fieldset>

    <fieldset>
      <legend>{{ sk.adminCatalog.sectionClassification }}</legend>
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
    </fieldset>

    <fieldset>
      <legend>{{ sk.adminCatalog.sectionContent }}</legend>
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

      <span class="asset-type-editor__group-label">{{
        sk.adminCatalog.specificationsHeading
      }}</span>
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
        <AppButton variant="quiet" :disabled="index === 0" @click="moveSpecification(index, -1)">
          {{ sk.adminCatalog.moveUpAction }}
        </AppButton>
        <AppButton
          variant="quiet"
          :disabled="index === form.specifications.length - 1"
          @click="moveSpecification(index, 1)"
        >
          {{ sk.adminCatalog.moveDownAction }}
        </AppButton>
        <AppButton variant="quiet" @click="removeSpecification(index)">
          {{ sk.adminCatalog.removeSpecificationAction }}
        </AppButton>
      </div>
      <AppButton variant="secondary" @click="addSpecification">{{
        sk.adminCatalog.addSpecificationAction
      }}</AppButton>
    </fieldset>

    <fieldset>
      <legend>{{ sk.adminCatalog.sectionImage }}</legend>
      <div class="asset-type-editor__image">
        <AppField :label="sk.adminCatalog.fieldImage">
          <template #default="slotProps">
            <select :id="slotProps.id" v-model="form.imageFile">
              <option :value="null">{{ sk.adminCatalog.noImage }}</option>
              <option v-for="file in images" :key="file" :value="file">{{ file }}</option>
            </select>
          </template>
        </AppField>
        <img
          v-if="form.imageFile"
          :src="`/catalog/${form.imageFile}`"
          alt=""
          width="120"
          height="120"
        />
      </div>
    </fieldset>

    <fieldset>
      <legend>{{ sk.adminCatalog.sectionAccessory }}</legend>
      <div
        class="asset-type-editor__checks"
        role="group"
        :aria-label="sk.adminCatalog.accessoryOfLabel"
      >
        <span class="asset-type-editor__group-label">{{ sk.adminCatalog.accessoryOfLabel }}</span>
        <label v-for="candidate in principalCandidates" :key="candidate.id">
          <input v-model="form.principalIds" type="checkbox" :value="candidate.id" />
          {{ candidate.name }}
        </label>
      </div>
      <AppAlert
        v-if="form.principalIds.length > 0"
        variant="info"
        :message="sk.adminCatalog.accessoryOfHint"
      />
    </fieldset>

    <div class="asset-type-editor__actions">
      <AppButton type="submit" variant="primary" :pending="pending">
        {{ pending ? sk.adminCatalog.saving : sk.adminCatalog.saveAction }}
      </AppButton>
      <AppButton type="button" variant="quiet" @click="emit('cancel')">{{
        sk.adminCatalog.cancelAction
      }}</AppButton>
    </div>
  </form>
</template>

<style scoped>
.asset-type-editor {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-4);
  padding: var(--ht-space-3) 0;
}

.asset-type-editor fieldset {
  border: 1px solid var(--ht-line);
  border-radius: var(--ht-radius-card);
  padding: var(--ht-space-3);
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-3);
}

.asset-type-editor legend {
  font-family: var(--ht-font-condensed);
  font-weight: 600;
  padding: 0 var(--ht-space-1);
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

.asset-type-editor__spec {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--ht-space-2);
}

.asset-type-editor__image {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--ht-space-4);
}

.asset-type-editor__image img {
  object-fit: contain;
  border: 1px solid var(--ht-line);
  border-radius: var(--ht-radius-plate);
}

.asset-type-editor__actions {
  display: flex;
  gap: var(--ht-space-2);
}
</style>
