<script setup lang="ts">
// D-23, FR-39, W3, S-06; issue #31 (backend) / #80 IR-12 (this page). The
// Customer's self-service surface reached via the tokenised link emailed
// at ReservationConfirmed (server/api/webhooks/stripe.post.ts). Exactly
// the two capabilities the token grants, both already built server-side:
// GET .../customer-access/:token (view the ReservationGroup) and POST
// .../identity-evidence (submit an ID photo, D-15 — online, after
// payment). Never reads IdentityEvidence back (NFR-06) — there is
// nothing on this page that could show a photo that was already
// uploaded, only whether one exists.
//
// The upload step follows the same D-40 request -> PUT -> confirm
// sequence as admin/counter.vue's Operator-side fallback capture: a
// presigned URL is requested, the browser PUTs the file straight to R2
// (never through this app — NFR-05's own reasoning extended to
// evidence), then a confirm call HEAD-checks the object actually landed
// before the row counts as evidence.
import { sk } from '~/i18n/sk'

definePageMeta({ layout: 'public' })

interface ReservationView {
  id: number
  assetTypeId: number
  period: { startDay: string; endDay: string }
  state: string
}

interface AssetTypeOption {
  id: number
  name: string
}

const STATE_TONES = ['pending', 'confirmed', 'cancelled', 'expired'] as const
type StateTone = (typeof STATE_TONES)[number]

function stateTone(state: string): StateTone | 'neutral' {
  return (STATE_TONES as readonly string[]).includes(state) ? (state as StateTone) : 'neutral'
}

const route = useRoute()
const token = route.params.token as string

const loadState = ref<'loading' | 'loaded' | 'not_found' | 'error'>('loading')
const customerName = ref('')
const reservations = ref<ReservationView[]>([])
const assetTypes = ref<AssetTypeOption[]>([])

const uploadFile = ref<File | null>(null)
const uploadState = ref<'idle' | 'uploading' | 'confirming' | 'done' | 'error'>('idle')
const uploadError = ref<string | null>(null)

function assetTypeName(assetTypeId: number): string {
  return assetTypes.value.find((a) => a.id === assetTypeId)?.name ?? String(assetTypeId)
}

async function load() {
  loadState.value = 'loading'
  try {
    const [booking, publishedAssetTypes] = await Promise.all([
      $fetch<{ customer: { name: string }; reservations: ReservationView[] }>(
        `/api/public/customer-access/${token}`,
      ),
      $fetch<AssetTypeOption[]>('/api/public/asset-types'),
    ])
    customerName.value = booking.customer.name
    reservations.value = booking.reservations
    assetTypes.value = publishedAssetTypes
    loadState.value = 'loaded'
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode
    loadState.value = statusCode === 404 ? 'not_found' : 'error'
  }
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  uploadFile.value = input.files?.[0] ?? null
}

async function submitIdentityEvidence() {
  const file = uploadFile.value
  if (!file) return

  uploadError.value = null
  uploadState.value = 'uploading'
  try {
    const { identityEvidenceId, uploadUrl } = await $fetch<{ identityEvidenceId: number; uploadUrl: string }>(
      `/api/public/customer-access/${token}/identity-evidence`,
      { method: 'POST', body: { contentType: file.type } },
    )

    const putResponse = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
    if (!putResponse.ok) throw new Error('upload failed')

    uploadState.value = 'confirming'
    const outcome = await $fetch<{ outcome: string }>(
      `/api/public/customer-access/${token}/identity-evidence/${identityEvidenceId}/confirm`,
      { method: 'POST' },
    )

    if (outcome.outcome === 'confirmed') {
      uploadState.value = 'done'
    } else {
      uploadState.value = 'error'
      uploadError.value = sk.customerAccess.uploadNotConfirmedError
    }
  } catch (err: unknown) {
    uploadState.value = 'error'
    const statusCode = (err as { statusCode?: number })?.statusCode
    uploadError.value = statusCode === 409 ? sk.customerAccess.uploadUnavailableError : sk.customerAccess.uploadGenericError
  }
}

await load()
</script>

<template>
  <main class="customer-access">
    <h1>{{ sk.customerAccess.title }}</h1>

    <p v-if="loadState === 'loading'">{{ sk.customerAccess.loading }}</p>
    <AppAlert v-else-if="loadState === 'not_found'" :message="sk.customerAccess.linkNotFound" />
    <AppAlert v-else-if="loadState === 'error'" :message="sk.customerAccess.loadError" />

    <template v-else-if="loadState === 'loaded'">
      <p>{{ sk.customerAccess.greeting.replace('{name}', customerName) }}</p>

      <section class="customer-access__section">
        <h2>{{ sk.customerAccess.reservationsHeading }}</h2>
        <ul class="customer-access__reservations">
          <li v-for="reservation in reservations" :key="reservation.id">
            <span>{{ assetTypeName(reservation.assetTypeId) }}</span>
            <DayRange :start-day="reservation.period.startDay" :end-day="reservation.period.endDay" />
            <StateChip :tone="stateTone(reservation.state)" :label="sk.customerAccess.stateLabels[reservation.state as keyof typeof sk.customerAccess.stateLabels] ?? reservation.state" />
          </li>
        </ul>
      </section>

      <section class="customer-access__section">
        <h2>{{ sk.customerAccess.uploadHeading }}</h2>
        <p>{{ sk.customerAccess.uploadIntro }}</p>
        <p class="customer-access__why">{{ sk.customerAccess.uploadWhySentence }}</p>

        <template v-if="uploadState !== 'done'">
          <AppField :label="sk.customerAccess.fileLabel">
            <template #default="slotProps">
              <input :id="slotProps.id" type="file" accept="image/*" @change="onFileChange" />
            </template>
          </AppField>
          <AppButton
            variant="primary"
            :disabled="!uploadFile"
            :pending="uploadState === 'uploading' || uploadState === 'confirming'"
            @click="submitIdentityEvidence"
          >
            {{ uploadState === 'uploading' || uploadState === 'confirming' ? sk.customerAccess.uploading : sk.customerAccess.uploadAction }}
          </AppButton>
          <AppAlert :message="uploadError" />
        </template>
        <p v-else>{{ sk.customerAccess.uploadDone }}</p>
      </section>
    </template>
  </main>
</template>

<style scoped>
.customer-access {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--ht-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-5);
}

.customer-access__section {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-3);
}

.customer-access__reservations {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-2);
}

.customer-access__reservations li {
  display: flex;
  align-items: center;
  gap: var(--ht-space-3);
  padding: var(--ht-space-2) 0;
  border-bottom: 1px solid var(--ht-line);
}

.customer-access__why {
  color: var(--ht-ink-muted);
  font-size: var(--ht-text-2);
}
</style>
