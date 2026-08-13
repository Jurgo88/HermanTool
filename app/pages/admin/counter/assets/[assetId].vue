<script setup lang="ts">
// S-13 (FR-43, FR-45, P4, D-10; issue #117). The Asset's own card: current
// status, active tag, and the append-only attestation history (C-18) —
// the artefact P4 exists to produce, what gets read out in a dispute.
// Also hosts the two acts that start from an Asset's own page: declaring
// it lost (S-16, reachable from here and from S-14) and recording a late
// or corrected HandoverIn (S-17) for whichever RentalAgreement is
// currently open on this Asset — both append a new fact, neither edits
// what is already recorded (P1).
import { sk } from '~/i18n/sk'
import type { PhotoState } from '~/components/PhotoCapture.vue'
import type { AttestationHistoryEntryView } from '~/components/AttestationTimeline.vue'
import { getErrorCode } from '~/utils/error-code'

definePageMeta({ layout: 'counter' })

const photoStateLabels: Record<PhotoState, string> = {
  requested: sk.adminCounter.photoStateRequested,
  uploading: sk.adminCounter.photoStateUploading,
  uploaded: sk.adminCounter.photoStateUploaded,
  confirmed: sk.adminCounter.photoStateConfirmed,
  error: sk.adminCounter.photoStateError,
}

interface AssetView {
  id: number
  assetTypeId: number
  status: string
}

interface HistoryResponse {
  asset: AssetView
  tagCode: string | null
  history: AttestationHistoryEntryView[]
  operatorNames: Record<string, string>
}

const route = useRoute()
const assetId = Number(route.params.assetId)
const requestFetch = useRequestFetch()
const nuxtApp = useNuxtApp()

const asset = ref<AssetView | null>(null)
const tagCode = ref<string | null>(null)
const history = ref<AttestationHistoryEntryView[]>([])
const operatorNames = ref<Record<string, string>>({})
const errorCode = ref<string | null>(null)
const errorMessage = ref<string | null>(null)
const info = ref<string | null>(null)

// The open RentalAgreement, if any — the most recent one still lacking
// both a HandoverIn and a LostAsset declaration. listRentalAgreementsForAsset
// orders oldest-first, so it is always the last entry when it exists.
const openAgreement = computed(() => {
  const last = history.value[history.value.length - 1]
  if (!last) return null
  const ra = last.rentalAgreement
  return !ra.handoverInAt && !ra.declaredLostAt ? ra : null
})

async function handleFetchError(err: unknown): Promise<boolean> {
  const statusCode = (err as { statusCode?: number })?.statusCode
  const code = getErrorCode(err)
  if (statusCode === 401 && code !== 'InvalidPinError') {
    await nuxtApp.runWithContext(() => navigateTo('/login'))
    return true
  }
  errorMessage.value = null
  errorCode.value = code ?? 'UNKNOWN'
  return false
}

async function load() {
  try {
    const result = await requestFetch<HistoryResponse>(`/api/handover/assets/${assetId}/attestation-history`)
    asset.value = result.asset
    tagCode.value = result.tagCode
    history.value = result.history
    operatorNames.value = result.operatorNames
  } catch (err: unknown) {
    await handleFetchError(err)
  }
}

await load()

function goBack() {
  navigateTo('/admin/counter')
}

async function uploadFile(url: string, file: File): Promise<void> {
  await $fetch(url, { method: 'PUT', body: file, headers: { 'content-type': file.type } })
}

// ---------------------------------------------------------------------
// S-16 Declare lost — always an explicit Operator declaration with a
// reason (FR-31, D-17), never a timer, never bulk.
// ---------------------------------------------------------------------
const showDeclareLostConfirm = ref(false)
const showDeclareLostPin = ref(false)
const declareLostReason = ref('')
const submittingDeclareLost = ref(false)

function onDeclareLostConfirm(reason: string | undefined) {
  declareLostReason.value = reason ?? ''
  showDeclareLostConfirm.value = false
  showDeclareLostPin.value = true
}

async function confirmDeclareLost(pin: string) {
  if (!openAgreement.value) return
  errorCode.value = null
  errorMessage.value = null
  submittingDeclareLost.value = true
  try {
    await $fetch(`/api/handover/rental-agreements/${openAgreement.value.id}/declare-lost`, {
      method: 'POST',
      body: { reason: declareLostReason.value, pin },
    })
    info.value = sk.assetHistory.declareLostSuccess
    await load()
  } catch (err: unknown) {
    await handleFetchError(err)
  } finally {
    submittingDeclareLost.value = false
    showDeclareLostPin.value = false
  }
}

// ---------------------------------------------------------------------
// S-17 Record a late or corrected HandoverIn (FR-24, P1, D-10, NFR-01).
// Same performHandoverIn call the live scan path uses, with `backdate`
// populated — an appended fact, not an edit.
// ---------------------------------------------------------------------
const showLateAttestationForm = ref(false)
const lateOccurredAt = ref('')
const lateReason = ref('')
const latePhotos = ref<File[]>([])
const latePhotoStates = ref<PhotoState[]>([])
const lateUploadUrls = ref<string[]>([])
const lateConditionReportId = ref<number | null>(null)
const showLatePin = ref(false)
const submittingLateAttestation = ref(false)

watch(latePhotos, (files) => {
  latePhotoStates.value = files.map((_, i) => latePhotoStates.value[i] ?? 'requested')
})

function startLateAttestation() {
  errorCode.value = null
  errorMessage.value = null
  info.value = null
  lateOccurredAt.value = ''
  lateReason.value = ''
  latePhotos.value = []
  showLateAttestationForm.value = true
}

async function uploadOneLatePhoto(index: number) {
  const file = latePhotos.value[index]
  const url = lateUploadUrls.value[index]
  if (!file || !url) return
  latePhotoStates.value[index] = 'uploading'
  try {
    await uploadFile(url, file)
    latePhotoStates.value[index] = 'uploaded'
  } catch {
    latePhotoStates.value[index] = 'error'
  }
}

async function finishLateAttestation() {
  if (!lateConditionReportId.value) return
  try {
    await $fetch(`/api/handover/condition-reports/${lateConditionReportId.value}/confirm`, { method: 'POST' })
    latePhotoStates.value = latePhotoStates.value.map(() => 'confirmed')
    info.value = sk.assetHistory.lateAttestationSuccess
    showLateAttestationForm.value = false
    await load()
  } catch (err: unknown) {
    await handleFetchError(err)
  }
}

async function retryLatePhoto(index: number) {
  await uploadOneLatePhoto(index)
  if (latePhotoStates.value.every((s) => s === 'uploaded')) await finishLateAttestation()
}

async function confirmLateAttestation(pin: string) {
  if (!tagCode.value) return
  errorCode.value = null
  errorMessage.value = null
  submittingLateAttestation.value = true
  try {
    const result = await $fetch<{ conditionReport: { id: number }; conditionPhotoUploadUrls: string[] }>(
      '/api/handover/handover-in',
      {
        method: 'POST',
        body: {
          tagCode: tagCode.value,
          conditionPhotoContentTypes: latePhotos.value.map((f) => f.type),
          pin,
          backdate: { occurredAt: lateOccurredAt.value, reason: lateReason.value },
        },
      },
    )

    lateUploadUrls.value = result.conditionPhotoUploadUrls
    lateConditionReportId.value = result.conditionReport.id

    await Promise.all(latePhotos.value.map((_, i) => uploadOneLatePhoto(i)))
    if (latePhotoStates.value.every((s) => s === 'uploaded')) {
      await finishLateAttestation()
    } else {
      errorMessage.value = sk.adminCounter.photoUploadFailed
    }
  } catch (err: unknown) {
    await handleFetchError(err)
  } finally {
    submittingLateAttestation.value = false
    showLatePin.value = false
  }
}
</script>

<template>
  <main>
    <StepHeader :title="sk.assetHistory.title" @back="goBack" />
    <AppAlert :code="errorCode" :message="errorMessage" />
    <p v-if="info">{{ info }}</p>

    <section v-if="asset">
      <p>{{ sk.assetHistory.statusLabel }}: <StateChip :label="asset.status" tone="neutral" /></p>
      <p>
        {{ sk.assetHistory.tagCodeLabel }}:
        <TagCodePlate v-if="tagCode">{{ tagCode }}</TagCodePlate>
        <span v-else>{{ sk.assetHistory.noTagCode }}</span>
      </p>

      <section v-if="openAgreement">
        <AppButton variant="danger" @click="showDeclareLostConfirm = true">
          {{ sk.assetHistory.declareLostAction }}
        </AppButton>
        <AppButton variant="secondary" @click="startLateAttestation">
          {{ sk.assetHistory.lateAttestationAction }}
        </AppButton>
      </section>
    </section>

    <section v-if="showLateAttestationForm">
      <h2>{{ sk.assetHistory.lateAttestationHeading }}</h2>
      <p>{{ sk.assetHistory.lateAttestationIntro }}</p>
      <form @submit.prevent="latePhotos.length > 0 && lateOccurredAt && lateReason && (showLatePin = true)">
        <AppField :label="sk.assetHistory.occurredAtLabel">
          <template #default="slotProps">
            <input :id="slotProps.id" v-model="lateOccurredAt" type="datetime-local" required />
          </template>
        </AppField>
        <AppField :label="sk.assetHistory.reasonLabel">
          <template #default="slotProps">
            <input :id="slotProps.id" v-model="lateReason" type="text" required />
          </template>
        </AppField>
        <PhotoCapture
          v-model="latePhotos"
          :states="latePhotoStates"
          :label="sk.assetHistory.conditionPhotosLabel"
          :add-label="sk.assetHistory.conditionPhotosAddAction"
          :state-labels="photoStateLabels"
          :retry-label="sk.adminCounter.retryPhotoAction"
          :remove-label="sk.adminCounter.removePhotoAction"
          @retry="retryLatePhoto"
        />
        <AppButton type="submit" size="counter" :disabled="latePhotos.length === 0">
          {{ sk.assetHistory.lateAttestationSubmitAction }}
        </AppButton>
      </form>
      <PinPrompt
        :open="showLatePin"
        :pending="submittingLateAttestation"
        :pending-label="sk.assetHistory.lateAttestationSubmitting"
        @confirm="confirmLateAttestation"
        @close="showLatePin = false"
      />
    </section>

    <section>
      <h2>{{ sk.assetHistory.historyHeading }}</h2>
      <EmptyState v-if="history.length === 0" :message="sk.assetHistory.emptyHistory" />
      <AttestationTimeline v-else :entries="history" :operator-names="operatorNames" />
    </section>

    <ConfirmAction
      :open="showDeclareLostConfirm"
      :title-text="sk.assetHistory.declareLostConfirmTitle"
      :body-text="sk.assetHistory.declareLostConfirmBody"
      :confirm-label="sk.assetHistory.declareLostAction"
      :reason-label="sk.assetHistory.declareLostReasonLabel"
      @confirm="onDeclareLostConfirm"
      @close="showDeclareLostConfirm = false"
    />
    <PinPrompt
      :open="showDeclareLostPin"
      :pending="submittingDeclareLost"
      :pending-label="sk.assetHistory.declareLostAction"
      @confirm="confirmDeclareLost"
      @close="showDeclareLostPin = false"
    />
  </main>
</template>
