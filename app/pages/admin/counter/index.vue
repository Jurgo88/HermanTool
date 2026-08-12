<script setup lang="ts">
// Counter surface (W3, W4, W5; issue #80/IR-12). "The thirty seconds
// the whole product exists to make fast" — scan/worklist to resolved
// intent to HandoverOut/HandoverIn, PIN re-confirmation (F8), condition
// photo capture, deposit settlement. Every write goes through Nitro
// routes that gate on requireOperator; this page declares no state
// transition itself (D-25) — it only assembles the sequence of calls
// each workflow already requires server-side.
//
// Upload sequencing (D-40): every photo (IdentityEvidence fallback,
// ConditionReport) follows request-url -> PUT the file -> confirm. The
// confirm step is not optional — an unconfirmed ConditionReport never
// satisfies FR-20's deduction check, and an unconfirmed IdentityEvidence
// row names an object that may not exist.
import { sk } from '~/i18n/sk'
import type { PhotoState } from '~/components/PhotoCapture.vue'
import { getErrorCode } from '~/utils/error-code'
import { formatDayRange, formatMoney } from '~/utils/format'

definePageMeta({ layout: 'counter' })

const photoStateLabels: Record<PhotoState, string> = {
  requested: sk.adminCounter.photoStateRequested,
  uploading: sk.adminCounter.photoStateUploading,
  uploaded: sk.adminCounter.photoStateUploaded,
  confirmed: sk.adminCounter.photoStateConfirmed,
  error: sk.adminCounter.photoStateError,
}

interface ReservationView {
  id: number
  assetTypeId: number
  period: { startDay: string; endDay: string }
}

interface TodaysPickupView {
  reservation: ReservationView
  assetTypeName: string
  customerName: string
  customerId: number | null
}

interface TodaysReturnView {
  reservation: ReservationView
  rentalAgreement: { id: number }
  assetTypeName: string
  customerName: string
  customerId: number | null
}

interface AssetTypeView {
  id: number
  depositAmount: { amount: number; currency: string }
}

interface ScanResolutionView {
  kind: 'handover_out' | 'handover_in' | 'asset_lookup'
  asset: { id: number; status: string }
}

interface IdentityEvidenceView {
  id: number
  createdAt: string
  confirmedAt: string | null
}

const nuxtApp = useNuxtApp()
const requestFetch = useRequestFetch()

const pickups = ref<TodaysPickupView[]>([])
const returns = ref<TodaysReturnView[]>([])
const assetTypes = ref<AssetTypeView[]>([])
const errorCode = ref<string | null>(null)
const errorMessage = ref<string | null>(null)
const info = ref<string | null>(null)

type Panel = 'none' | 'handoverOut' | 'handoverIn' | 'settlement' | 'lookup'
const panel = ref<Panel>('none')

function depositFor(assetTypeId: number): string {
  const assetType = assetTypes.value.find((a) => a.id === assetTypeId)
  if (!assetType) return ''
  return formatMoney(assetType.depositAmount)
}

async function handleFetchError(err: unknown): Promise<boolean> {
  const statusCode = (err as { statusCode?: number })?.statusCode
  const code = getErrorCode(err)
  // D-50/UIF-03, and a real bug this surfaced: verifyOperatorPin's wrong-PIN
  // rejection and requireOperator's session-expired rejection are both a
  // 401 — indistinguishable without the code. Treating every 401 as
  // "redirect to /login" silently discarded an in-progress HandoverOut/
  // HandoverIn/Settlement (uploaded photos, scanned tag) the moment an
  // Operator mistyped a PIN. Only a genuine session expiry (no code — it
  // never goes through a translate*Error function) redirects.
  if (statusCode === 401 && code !== 'InvalidPinError') {
    await nuxtApp.runWithContext(() => navigateTo('/login'))
    return true
  }
  errorMessage.value = null
  errorCode.value = code ?? 'UNKNOWN'
  return false
}

async function loadWorklist() {
  try {
    const [today, catalog] = await Promise.all([
      requestFetch<{ pickups: TodaysPickupView[]; returns: TodaysReturnView[] }>('/api/handover/today'),
      requestFetch<AssetTypeView[]>('/api/catalog/asset-types'),
    ])
    pickups.value = today.pickups
    returns.value = today.returns
    assetTypes.value = catalog
  } catch (err: unknown) {
    await handleFetchError(err)
  }
}

async function uploadFile(url: string, file: File): Promise<void> {
  await $fetch(url, { method: 'PUT', body: file, headers: { 'content-type': file.type } })
}

await loadWorklist()

// ---------------------------------------------------------------------
// Global scan (handover_in / asset_lookup — handover_out needs a
// worklist row's reservation+customer context first, see below).
// ---------------------------------------------------------------------
const scanning = ref(false)
const lookupResult = ref<ScanResolutionView | null>(null)

async function submitScan(tagCode: string) {
  errorCode.value = null
  errorMessage.value = null
  info.value = null
  scanning.value = true
  try {
    const result = await $fetch<ScanResolutionView>('/api/handover/scan', {
      method: 'POST',
      body: { tagCode },
    })
    if (result.kind === 'handover_in') {
      startHandoverIn(tagCode)
    } else {
      lookupResult.value = result
      panel.value = 'lookup'
    }
  } catch (err: unknown) {
    await handleFetchError(err)
  } finally {
    scanning.value = false
  }
}

function resetToWorklist() {
  panel.value = 'none'
  errorCode.value = null
  errorMessage.value = null
  info.value = null
  lookupResult.value = null
}

// ---------------------------------------------------------------------
// HandoverOut (W3 identity verification, then W4)
// ---------------------------------------------------------------------
const activePickup = ref<TodaysPickupView | null>(null)
const evidenceList = ref<IdentityEvidenceView[]>([])
const verificationDone = ref(false)
const evidenceFile = ref<File | null>(null)
const uploadingEvidence = ref(false)
const rejectionReason = ref('')

const outTagCode = ref('')
const outPhotos = ref<File[]>([])
const outPhotoStates = ref<PhotoState[]>([])
const outUploadUrls = ref<string[]>([])
const outConditionReportId = ref<number | null>(null)
const outRentalAgreementId = ref<number | null>(null)
const submittingHandoverOut = ref(false)
const showOutPinPrompt = ref(false)

watch(outPhotos, (files) => {
  outPhotoStates.value = files.map((_, i) => outPhotoStates.value[i] ?? 'requested')
})

const handoverOutBackGuard = computed(() =>
  uploadingEvidence.value || outPhotos.value.length > 0
    ? 'Rozrobené vydanie náradia sa stratí. Naozaj chcete odísť?'
    : null,
)

async function startHandoverOut(pickup: TodaysPickupView) {
  errorCode.value = null
  errorMessage.value = null
  info.value = null
  activePickup.value = pickup
  verificationDone.value = false
  evidenceFile.value = null
  outTagCode.value = ''
  outPhotos.value = []
  panel.value = 'handoverOut'

  if (pickup.customerId) {
    try {
      evidenceList.value = await requestFetch<IdentityEvidenceView[]>(
        `/api/handover/customers/${pickup.customerId}/identity-evidence`,
      )
    } catch (err: unknown) {
      await handleFetchError(err)
    }
  }
}

async function viewEvidence(identityEvidenceId: number) {
  if (!activePickup.value?.customerId) return
  errorCode.value = null
  errorMessage.value = null
  try {
    const { readUrl } = await $fetch<{ readUrl: string }>(
      `/api/handover/customers/${activePickup.value.customerId}/identity-evidence/${identityEvidenceId}/read-url`,
    )
    window.open(readUrl, '_blank', 'noopener')
  } catch (err: unknown) {
    await handleFetchError(err)
  }
}

function onEvidenceFileChange(event: Event) {
  evidenceFile.value = (event.target as HTMLInputElement).files?.[0] ?? null
}

async function captureEvidenceFallback() {
  if (!activePickup.value?.customerId || !evidenceFile.value) return
  errorCode.value = null
  errorMessage.value = null
  uploadingEvidence.value = true
  try {
    const customerId = activePickup.value.customerId
    const { identityEvidenceId, uploadUrl } = await $fetch<{ identityEvidenceId: number; uploadUrl: string }>(
      `/api/handover/customers/${customerId}/identity-evidence`,
      { method: 'POST', body: { contentType: evidenceFile.value.type } },
    )
    await uploadFile(uploadUrl, evidenceFile.value)
    await $fetch(`/api/handover/customers/${customerId}/identity-evidence/${identityEvidenceId}/confirm`, {
      method: 'POST',
    })
    evidenceList.value = await requestFetch<IdentityEvidenceView[]>(
      `/api/handover/customers/${customerId}/identity-evidence`,
    )
    evidenceFile.value = null
  } catch (err: unknown) {
    await handleFetchError(err)
  } finally {
    uploadingEvidence.value = false
  }
}

async function recordVerification(identityEvidenceId: number, outcome: 'verified' | 'rejected') {
  if (!activePickup.value?.customerId) return
  errorCode.value = null
  errorMessage.value = null
  try {
    await $fetch(`/api/handover/customers/${activePickup.value.customerId}/identity-verification`, {
      method: 'POST',
      body: {
        identityEvidenceId,
        outcome,
        reason: outcome === 'rejected' ? rejectionReason.value || 'Nezhoduje sa' : undefined,
      },
    })
    if (outcome === 'verified') {
      verificationDone.value = true
      info.value = sk.adminCounter.verificationRecorded
    }
  } catch (err: unknown) {
    await handleFetchError(err)
  }
}

async function uploadOneOutPhoto(index: number) {
  const file = outPhotos.value[index]
  const url = outUploadUrls.value[index]
  if (!file || !url) return
  outPhotoStates.value[index] = 'uploading'
  try {
    await uploadFile(url, file)
    outPhotoStates.value[index] = 'uploaded'
  } catch {
    outPhotoStates.value[index] = 'error'
  }
}

async function finishHandoverOut() {
  if (!outConditionReportId.value || !outRentalAgreementId.value) return
  try {
    await $fetch(`/api/handover/condition-reports/${outConditionReportId.value}/confirm`, { method: 'POST' })
    outPhotoStates.value = outPhotoStates.value.map(() => 'confirmed')
    info.value = sk.adminCounter.handoverOutSuccess.replace('{id}', String(outRentalAgreementId.value))
    panel.value = 'none'
    activePickup.value = null
    await loadWorklist()
  } catch (err: unknown) {
    await handleFetchError(err)
  }
}

async function retryOutPhoto(index: number) {
  await uploadOneOutPhoto(index)
  if (outPhotoStates.value.every((s) => s === 'uploaded')) await finishHandoverOut()
}

async function confirmHandoverOut(pin: string) {
  if (!activePickup.value) return
  errorCode.value = null
  errorMessage.value = null
  submittingHandoverOut.value = true
  try {
    const pickup = activePickup.value
    const result = await $fetch<{
      rentalAgreement: { id: number }
      conditionReport: { id: number }
      conditionPhotoUploadUrls: string[]
    }>('/api/handover/handover-out', {
      method: 'POST',
      body: {
        tagCode: outTagCode.value,
        reservationId: pickup.reservation.id,
        customerId: pickup.customerId,
        conditionPhotoContentTypes: outPhotos.value.map((f) => f.type),
        pin,
      },
    })

    outUploadUrls.value = result.conditionPhotoUploadUrls
    outConditionReportId.value = result.conditionReport.id
    outRentalAgreementId.value = result.rentalAgreement.id

    await Promise.all(outPhotos.value.map((_, i) => uploadOneOutPhoto(i)))
    if (outPhotoStates.value.every((s) => s === 'uploaded')) {
      await finishHandoverOut()
    } else {
      errorCode.value = null
      errorMessage.value = null
      errorMessage.value = sk.adminCounter.photoUploadFailed
    }
  } catch (err: unknown) {
    await handleFetchError(err)
  } finally {
    submittingHandoverOut.value = false
    showOutPinPrompt.value = false
  }
}

// ---------------------------------------------------------------------
// HandoverIn (W5) then Settlement
// ---------------------------------------------------------------------
const inTagCode = ref('')
const inPhotos = ref<File[]>([])
const inPhotoStates = ref<PhotoState[]>([])
const inUploadUrls = ref<string[]>([])
const inConditionReportId = ref<number | null>(null)
const submittingHandoverIn = ref(false)
const showInPinPrompt = ref(false)

watch(inPhotos, (files) => {
  inPhotoStates.value = files.map((_, i) => inPhotoStates.value[i] ?? 'requested')
})

const handoverInBackGuard = computed(() =>
  inPhotos.value.length > 0 ? 'Rozrobené vrátenie náradia sa stratí. Naozaj chcete odísť?' : null,
)
const settlingAgreementId = ref<number | null>(null)

function startHandoverIn(tagCode: string) {
  errorCode.value = null
  errorMessage.value = null
  info.value = null
  inTagCode.value = tagCode
  inPhotos.value = []
  panel.value = 'handoverIn'
}

async function uploadOneInPhoto(index: number) {
  const file = inPhotos.value[index]
  const url = inUploadUrls.value[index]
  if (!file || !url) return
  inPhotoStates.value[index] = 'uploading'
  try {
    await uploadFile(url, file)
    inPhotoStates.value[index] = 'uploaded'
  } catch {
    inPhotoStates.value[index] = 'error'
  }
}

async function finishHandoverIn() {
  if (!inConditionReportId.value || !settlingAgreementId.value) return
  try {
    await $fetch(`/api/handover/condition-reports/${inConditionReportId.value}/confirm`, { method: 'POST' })
    inPhotoStates.value = inPhotoStates.value.map(() => 'confirmed')
    info.value = sk.adminCounter.handoverInSuccess
    panel.value = 'settlement'
    await loadPairedEvidenceStatus(settlingAgreementId.value)
  } catch (err: unknown) {
    await handleFetchError(err)
  }
}

async function retryInPhoto(index: number) {
  await uploadOneInPhoto(index)
  if (inPhotoStates.value.every((s) => s === 'uploaded')) await finishHandoverIn()
}

async function confirmHandoverIn(pin: string) {
  errorCode.value = null
  errorMessage.value = null
  submittingHandoverIn.value = true
  try {
    const result = await $fetch<{
      rentalAgreement: { id: number }
      conditionReport: { id: number }
      conditionPhotoUploadUrls: string[]
    }>('/api/handover/handover-in', {
      method: 'POST',
      body: {
        tagCode: inTagCode.value,
        conditionPhotoContentTypes: inPhotos.value.map((f) => f.type),
        pin,
      },
    })

    inUploadUrls.value = result.conditionPhotoUploadUrls
    inConditionReportId.value = result.conditionReport.id
    settlingAgreementId.value = result.rentalAgreement.id

    await Promise.all(inPhotos.value.map((_, i) => uploadOneInPhoto(i)))
    if (inPhotoStates.value.every((s) => s === 'uploaded')) {
      await finishHandoverIn()
    } else {
      errorCode.value = null
      errorMessage.value = sk.adminCounter.photoUploadFailed
    }
  } catch (err: unknown) {
    await handleFetchError(err)
  } finally {
    submittingHandoverIn.value = false
    showInPinPrompt.value = false
  }
}

const returnedAmountEuros = ref('')
const deductionReason = ref('')
const submittingSettlement = ref(false)
const showSettlementPinPrompt = ref(false)

// D-49, FR-20: shown before a deduction is attempted, not only found out
// from the server's own refusal — the check itself still lives
// exclusively in completeSettlement.
const pairedEvidenceOut = ref(false)
const pairedEvidenceIn = ref(false)
const pairedEvidenceComplete = computed(() => pairedEvidenceOut.value && pairedEvidenceIn.value)

async function loadPairedEvidenceStatus(rentalAgreementId: number) {
  try {
    const reports = await requestFetch<{ stage: string; confirmedAt: string | null }[]>(
      `/api/handover/rental-agreements/${rentalAgreementId}/condition-reports`,
    )
    pairedEvidenceOut.value = reports.some((r) => r.stage === 'handover_out' && r.confirmedAt !== null)
    pairedEvidenceIn.value = reports.some((r) => r.stage === 'handover_in' && r.confirmedAt !== null)
  } catch (err: unknown) {
    await handleFetchError(err)
  }
}

async function confirmSettlement(pin: string) {
  if (!settlingAgreementId.value) return
  errorCode.value = null
  errorMessage.value = null
  submittingSettlement.value = true
  try {
    await $fetch(`/api/handover/rental-agreements/${settlingAgreementId.value}/settlement`, {
      method: 'POST',
      body: {
        returnedAmount: { amount: Math.round(Number(returnedAmountEuros.value) * 100), currency: 'EUR' },
        deductionReason: deductionReason.value || undefined,
        pin,
      },
    })
    info.value = sk.adminCounter.settlementSuccess
    panel.value = 'none'
    settlingAgreementId.value = null
    returnedAmountEuros.value = ''
    deductionReason.value = ''
    pairedEvidenceOut.value = false
    pairedEvidenceIn.value = false
    await loadWorklist()
  } catch (err: unknown) {
    await handleFetchError(err)
  } finally {
    submittingSettlement.value = false
    showSettlementPinPrompt.value = false
  }
}
</script>

<template>
  <main>
    <h1>{{ sk.adminCounter.title }}</h1>
    <AppAlert :code="errorCode" :message="errorMessage" />
    <p v-if="info">{{ info }}</p>

    <section v-if="panel === 'none'">
      <section>
        <h2>{{ sk.adminCounter.scanHeading }}</h2>
        <ScanTarget
          :hint-text="sk.adminCounter.scanHint"
          :denied-text="sk.adminCounter.scanCameraDenied"
          :unsupported-text="sk.adminCounter.scanCameraUnsupported"
          :manual-label="sk.adminCounter.scanLabel"
          :manual-action="sk.adminCounter.scanAction"
          :scanning-label="sk.adminCounter.scanning"
          :pending="scanning"
          @scan="submitScan"
        />
      </section>

      <section>
        <h2>{{ sk.adminCounter.pickupsHeading }}</h2>
        <EmptyState v-if="pickups.length === 0" :message="sk.adminCounter.noPickups" />
        <TwoClockRow
          v-for="pickup in pickups"
          :key="pickup.reservation.id"
          :title="`${pickup.customerName} — ${pickup.assetTypeName}`"
          :expected-label="sk.adminCounter.expectedLabel"
          :expected-value="formatDayRange(pickup.reservation.period.startDay, pickup.reservation.period.endDay)"
          :actual-label="sk.adminCounter.actualLabelPickup"
          :actual-value="sk.adminCounter.actualValueNotPickedUp"
        >
          <AppButton variant="secondary" @click="startHandoverOut(pickup)">
            {{ sk.adminCounter.handoverOutAction }}
          </AppButton>
        </TwoClockRow>
      </section>

      <section>
        <h2>{{ sk.adminCounter.returnsHeading }}</h2>
        <EmptyState v-if="returns.length === 0" :message="sk.adminCounter.noReturns" />
        <TwoClockRow
          v-for="ret in returns"
          :key="ret.reservation.id"
          :title="`${ret.customerName} — ${ret.assetTypeName}`"
          :expected-label="sk.adminCounter.expectedLabel"
          :expected-value="formatDayRange(ret.reservation.period.startDay, ret.reservation.period.endDay)"
          :actual-label="sk.adminCounter.actualLabelReturn"
          :actual-value="sk.adminCounter.actualValueWithCustomer"
        />
      </section>

      <section>
        <h2>{{ sk.adminCounter.worklistNavHeading }}</h2>
        <NuxtLink to="/admin/counter/overdue">{{ sk.adminCounter.overdueNavAction }}</NuxtLink>
        <NuxtLink to="/admin/counter/no-shows">{{ sk.adminCounter.noShowsNavAction }}</NuxtLink>
      </section>
    </section>

    <section v-else-if="panel === 'lookup'">
      <StepHeader :title="sk.adminCounter.lookupHeading" @back="resetToWorklist" />
      <p v-if="lookupResult">
        {{ sk.adminCounter.assetLookupResult.replace('{assetId}', String(lookupResult.asset.id)).replace('{status}', lookupResult.asset.status) }}
      </p>
    </section>

    <section v-else-if="panel === 'handoverOut' && activePickup">
      <StepHeader
        :title="sk.adminCounter.handoverOutHeading.replace('{customerName}', activePickup.customerName)"
        :guard-message="handoverOutBackGuard"
        @back="resetToWorklist"
      />

      <section v-if="!verificationDone">
        <h3>{{ sk.adminCounter.identityVerificationHeading }}</h3>
        <p v-if="evidenceList.length === 0">{{ sk.adminCounter.noEvidence }}</p>
        <ul v-else>
          <li v-for="evidence in evidenceList" :key="evidence.id">
            {{ sk.adminCounter.evidenceUploadedAt.replace('{date}', new Date(evidence.createdAt).toLocaleString('sk-SK')) }}
            <span v-if="!evidence.confirmedAt">{{ sk.adminCounter.evidenceUnconfirmed }}</span>
            <button type="button" @click="viewEvidence(evidence.id)">{{ sk.adminCounter.viewEvidenceAction }}</button>
            <button type="button" @click="recordVerification(evidence.id, 'verified')">
              {{ sk.adminCounter.verifiedAction }}
            </button>
            <button type="button" @click="recordVerification(evidence.id, 'rejected')">
              {{ sk.adminCounter.rejectedAction }}
            </button>
          </li>
        </ul>
        <label>
          {{ sk.adminCounter.rejectionReasonLabel }}
          <input v-model="rejectionReason" type="text" />
        </label>

        <h4>{{ sk.adminCounter.captureFallbackHeading }}</h4>
        <label>
          {{ sk.adminCounter.fileLabel }}
          <input type="file" accept="image/*" capture="environment" @change="onEvidenceFileChange" />
        </label>
        <button type="button" :disabled="!evidenceFile || uploadingEvidence" @click="captureEvidenceFallback">
          {{ uploadingEvidence ? sk.adminCounter.uploading : sk.adminCounter.uploadAction }}
        </button>
      </section>

      <form v-else @submit.prevent="outPhotos.length > 0 && (showOutPinPrompt = true)">
        <p>{{ sk.adminCounter.depositLabel.replace('{amount}', depositFor(activePickup.reservation.assetTypeId)) }}</p>
        <label>
          {{ sk.adminCounter.tagCodeLabel }}
          <input v-model="outTagCode" type="text" required autofocus />
        </label>
        <PhotoCapture
          v-model="outPhotos"
          :states="outPhotoStates"
          :label="sk.adminCounter.conditionPhotosLabel"
          :add-label="sk.adminCounter.conditionPhotosAddAction"
          :state-labels="photoStateLabels"
          @retry="retryOutPhoto"
        />
        <AppButton type="submit" size="counter" :disabled="outPhotos.length === 0">
          {{ sk.adminCounter.submitHandoverOutAction }}
        </AppButton>
      </form>
      <PinPrompt
        :open="showOutPinPrompt"
        :pending="submittingHandoverOut"
        :pending-label="sk.adminCounter.submittingHandoverOut"
        @confirm="confirmHandoverOut"
        @close="showOutPinPrompt = false"
      />
    </section>

    <section v-else-if="panel === 'handoverIn'">
      <StepHeader :title="sk.adminCounter.handoverInHeading" :guard-message="handoverInBackGuard" @back="resetToWorklist" />
      <form @submit.prevent="inPhotos.length > 0 && (showInPinPrompt = true)">
        <label>
          {{ sk.adminCounter.tagCodeLabel }}
          <input v-model="inTagCode" type="text" readonly />
        </label>
        <PhotoCapture
          v-model="inPhotos"
          :states="inPhotoStates"
          :label="sk.adminCounter.conditionPhotosInLabel"
          :add-label="sk.adminCounter.conditionPhotosAddAction"
          :state-labels="photoStateLabels"
          @retry="retryInPhoto"
        />
        <AppButton type="submit" size="counter" :disabled="inPhotos.length === 0">
          {{ sk.adminCounter.submitHandoverInAction }}
        </AppButton>
      </form>
      <PinPrompt
        :open="showInPinPrompt"
        :pending="submittingHandoverIn"
        :pending-label="sk.adminCounter.submittingHandoverIn"
        @confirm="confirmHandoverIn"
        @close="showInPinPrompt = false"
      />
    </section>

    <section v-else-if="panel === 'settlement'">
      <StepHeader :title="sk.adminCounter.settlementHeading" :show-back="false" />
      <p>
        {{ sk.adminCounter.pairedEvidenceOutLabel }}:
        {{ pairedEvidenceOut ? sk.adminCounter.pairedEvidenceOk : sk.adminCounter.pairedEvidenceMissing }}
        · {{ sk.adminCounter.pairedEvidenceInLabel }}:
        {{ pairedEvidenceIn ? sk.adminCounter.pairedEvidenceOk : sk.adminCounter.pairedEvidenceMissing }}
      </p>
      <p v-if="!pairedEvidenceComplete">{{ sk.adminCounter.pairedEvidenceIncompleteNote }}</p>
      <form @submit.prevent="showSettlementPinPrompt = true">
        <label>
          {{ sk.adminCounter.returnedAmountLabel }}
          <input v-model="returnedAmountEuros" type="number" min="0" step="0.01" required />
        </label>
        <label>
          {{ sk.adminCounter.deductionReasonLabel }}
          <input v-model="deductionReason" type="text" :disabled="!pairedEvidenceComplete" />
        </label>
        <AppButton type="submit" size="counter">{{ sk.adminCounter.submitSettlementAction }}</AppButton>
      </form>
      <PinPrompt
        :open="showSettlementPinPrompt"
        :pending="submittingSettlement"
        :pending-label="sk.adminCounter.submittingSettlement"
        @confirm="confirmSettlement"
        @close="showSettlementPinPrompt = false"
      />
    </section>
  </main>
</template>
