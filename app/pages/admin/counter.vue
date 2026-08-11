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

definePageMeta({ layout: 'counter' })

interface ReservationView {
  id: number
  assetTypeId: number
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
const error = ref<string | null>(null)
const info = ref<string | null>(null)

type Panel = 'none' | 'handoverOut' | 'handoverIn' | 'settlement' | 'lookup'
const panel = ref<Panel>('none')

function toEuros(minorUnits: number): string {
  return (minorUnits / 100).toFixed(2)
}

function depositFor(assetTypeId: number): string {
  const assetType = assetTypes.value.find((a) => a.id === assetTypeId)
  if (!assetType) return ''
  return `${toEuros(assetType.depositAmount.amount)} ${assetType.depositAmount.currency}`
}

async function handleFetchError(err: unknown): Promise<boolean> {
  const statusCode = (err as { statusCode?: number })?.statusCode
  if (statusCode === 401) {
    await nuxtApp.runWithContext(() => navigateTo('/login'))
    return true
  }
  const message = (err as { data?: { statusMessage?: string } })?.data?.statusMessage
  error.value = message ?? sk.adminCounter.genericError
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
const scanTagCode = ref('')
const scanning = ref(false)
const lookupResult = ref<ScanResolutionView | null>(null)

async function submitScan() {
  error.value = null
  info.value = null
  scanning.value = true
  try {
    const result = await $fetch<ScanResolutionView>('/api/handover/scan', {
      method: 'POST',
      body: { tagCode: scanTagCode.value },
    })
    if (result.kind === 'handover_in') {
      startHandoverIn(scanTagCode.value)
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
  error.value = null
  info.value = null
  scanTagCode.value = ''
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
const outPin = ref('')
const outPhotos = ref<File[]>([])
const submittingHandoverOut = ref(false)

async function startHandoverOut(pickup: TodaysPickupView) {
  error.value = null
  info.value = null
  activePickup.value = pickup
  verificationDone.value = false
  evidenceFile.value = null
  outTagCode.value = ''
  outPin.value = ''
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
  error.value = null
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
  error.value = null
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
  error.value = null
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

function onOutPhotosChange(event: Event) {
  const files = (event.target as HTMLInputElement).files
  outPhotos.value = files ? Array.from(files) : []
}

async function submitHandoverOut() {
  if (!activePickup.value) return
  error.value = null
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
        pin: outPin.value,
      },
    })

    await Promise.all(
      outPhotos.value.map((file, i) => uploadFile(result.conditionPhotoUploadUrls[i]!, file)),
    )
    await $fetch(`/api/handover/condition-reports/${result.conditionReport.id}/confirm`, { method: 'POST' })

    info.value = sk.adminCounter.handoverOutSuccess.replace('{id}', String(result.rentalAgreement.id))
    panel.value = 'none'
    activePickup.value = null
    await loadWorklist()
  } catch (err: unknown) {
    await handleFetchError(err)
  } finally {
    submittingHandoverOut.value = false
  }
}

// ---------------------------------------------------------------------
// HandoverIn (W5) then Settlement
// ---------------------------------------------------------------------
const inTagCode = ref('')
const inPin = ref('')
const inPhotos = ref<File[]>([])
const submittingHandoverIn = ref(false)
const settlingAgreementId = ref<number | null>(null)

function startHandoverIn(tagCode: string) {
  error.value = null
  info.value = null
  inTagCode.value = tagCode
  inPin.value = ''
  inPhotos.value = []
  panel.value = 'handoverIn'
}

function onInPhotosChange(event: Event) {
  const files = (event.target as HTMLInputElement).files
  inPhotos.value = files ? Array.from(files) : []
}

async function submitHandoverIn() {
  error.value = null
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
        pin: inPin.value,
      },
    })

    await Promise.all(inPhotos.value.map((file, i) => uploadFile(result.conditionPhotoUploadUrls[i]!, file)))
    await $fetch(`/api/handover/condition-reports/${result.conditionReport.id}/confirm`, { method: 'POST' })

    info.value = sk.adminCounter.handoverInSuccess
    settlingAgreementId.value = result.rentalAgreement.id
    panel.value = 'settlement'
  } catch (err: unknown) {
    await handleFetchError(err)
  } finally {
    submittingHandoverIn.value = false
  }
}

const returnedAmountEuros = ref('')
const deductionReason = ref('')
const settlingPin = ref('')
const submittingSettlement = ref(false)

async function submitSettlement() {
  if (!settlingAgreementId.value) return
  error.value = null
  submittingSettlement.value = true
  try {
    await $fetch(`/api/handover/rental-agreements/${settlingAgreementId.value}/settlement`, {
      method: 'POST',
      body: {
        returnedAmount: { amount: Math.round(Number(returnedAmountEuros.value) * 100), currency: 'EUR' },
        deductionReason: deductionReason.value || undefined,
        pin: settlingPin.value,
      },
    })
    info.value = sk.adminCounter.settlementSuccess
    panel.value = 'none'
    settlingAgreementId.value = null
    returnedAmountEuros.value = ''
    deductionReason.value = ''
    settlingPin.value = ''
    await loadWorklist()
  } catch (err: unknown) {
    await handleFetchError(err)
  } finally {
    submittingSettlement.value = false
  }
}
</script>

<template>
  <main>
    <h1>{{ sk.adminCounter.title }}</h1>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="info">{{ info }}</p>

    <section v-if="panel === 'none'">
      <section>
        <h2>{{ sk.adminCounter.scanHeading }}</h2>
        <form @submit.prevent="submitScan">
          <label>
            {{ sk.adminCounter.scanLabel }}
            <input v-model="scanTagCode" type="text" required autofocus />
          </label>
          <button type="submit" :disabled="scanning">
            {{ scanning ? sk.adminCounter.scanning : sk.adminCounter.scanAction }}
          </button>
        </form>
      </section>

      <section>
        <h2>{{ sk.adminCounter.pickupsHeading }}</h2>
        <p v-if="pickups.length === 0">{{ sk.adminCounter.noPickups }}</p>
        <table v-else>
          <thead>
            <tr>
              <th>{{ sk.adminCounter.columnCustomer }}</th>
              <th>{{ sk.adminCounter.columnAssetType }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="pickup in pickups" :key="pickup.reservation.id">
              <td>{{ pickup.customerName }}</td>
              <td>{{ pickup.assetTypeName }}</td>
              <td>
                <button type="button" @click="startHandoverOut(pickup)">
                  {{ sk.adminCounter.handoverOutAction }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>{{ sk.adminCounter.returnsHeading }}</h2>
        <p v-if="returns.length === 0">{{ sk.adminCounter.noReturns }}</p>
        <table v-else>
          <thead>
            <tr>
              <th>{{ sk.adminCounter.columnCustomer }}</th>
              <th>{{ sk.adminCounter.columnAssetType }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ret in returns" :key="ret.reservation.id">
              <td>{{ ret.customerName }}</td>
              <td>{{ ret.assetTypeName }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </section>

    <section v-else-if="panel === 'lookup'">
      <p v-if="lookupResult">
        {{ sk.adminCounter.assetLookupResult.replace('{assetId}', String(lookupResult.asset.id)).replace('{status}', lookupResult.asset.status) }}
      </p>
      <button type="button" @click="resetToWorklist">{{ sk.adminCounter.backAction }}</button>
    </section>

    <section v-else-if="panel === 'handoverOut' && activePickup">
      <h2>{{ sk.adminCounter.handoverOutHeading.replace('{customerName}', activePickup.customerName) }}</h2>
      <button type="button" @click="resetToWorklist">{{ sk.adminCounter.backAction }}</button>

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

      <form v-else @submit.prevent="submitHandoverOut">
        <p>{{ sk.adminCounter.depositLabel.replace('{amount}', depositFor(activePickup.reservation.assetTypeId)) }}</p>
        <label>
          {{ sk.adminCounter.tagCodeLabel }}
          <input v-model="outTagCode" type="text" required autofocus />
        </label>
        <label>
          {{ sk.adminCounter.conditionPhotosLabel }}
          <input type="file" accept="image/*" capture="environment" multiple required @change="onOutPhotosChange" />
        </label>
        <label>
          {{ sk.adminCounter.pinLabel }}
          <input v-model="outPin" type="password" inputmode="numeric" required />
        </label>
        <button type="submit" :disabled="submittingHandoverOut">
          {{ submittingHandoverOut ? sk.adminCounter.submittingHandoverOut : sk.adminCounter.submitHandoverOutAction }}
        </button>
      </form>
    </section>

    <section v-else-if="panel === 'handoverIn'">
      <h2>{{ sk.adminCounter.handoverInHeading }}</h2>
      <button type="button" @click="resetToWorklist">{{ sk.adminCounter.backAction }}</button>
      <form @submit.prevent="submitHandoverIn">
        <label>
          {{ sk.adminCounter.tagCodeLabel }}
          <input v-model="inTagCode" type="text" readonly />
        </label>
        <label>
          {{ sk.adminCounter.conditionPhotosInLabel }}
          <input type="file" accept="image/*" capture="environment" multiple required @change="onInPhotosChange" />
        </label>
        <label>
          {{ sk.adminCounter.pinLabel }}
          <input v-model="inPin" type="password" inputmode="numeric" required />
        </label>
        <button type="submit" :disabled="submittingHandoverIn">
          {{ submittingHandoverIn ? sk.adminCounter.submittingHandoverIn : sk.adminCounter.submitHandoverInAction }}
        </button>
      </form>
    </section>

    <section v-else-if="panel === 'settlement'">
      <h2>{{ sk.adminCounter.settlementHeading }}</h2>
      <form @submit.prevent="submitSettlement">
        <label>
          {{ sk.adminCounter.returnedAmountLabel }}
          <input v-model="returnedAmountEuros" type="number" min="0" step="0.01" required />
        </label>
        <label>
          {{ sk.adminCounter.deductionReasonLabel }}
          <input v-model="deductionReason" type="text" />
        </label>
        <label>
          {{ sk.adminCounter.pinLabel }}
          <input v-model="settlingPin" type="password" inputmode="numeric" required />
        </label>
        <button type="submit" :disabled="submittingSettlement">
          {{ submittingSettlement ? sk.adminCounter.submittingSettlement : sk.adminCounter.submitSettlementAction }}
        </button>
      </form>
    </section>
  </main>
</template>
