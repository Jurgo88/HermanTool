<script setup lang="ts">
// S-14 (FR-29, D-17; issue #118). Ranked by the earliest day the Asset's
// continued absence causes confirmed demand to exceed Rentable supply for
// its AssetType — never by days late (Finding 12). The ranking is the
// requirement, so the reason for the rank is shown alongside every row.
// Declare lost (S-16) is reachable from here too — same ConfirmAction +
// PinPrompt sequence as the Asset view (S-13).
import { sk } from '~/i18n/sk'
import { getErrorCode } from '~/utils/error-code'
import { formatDay, formatDayRange } from '~/utils/format'

definePageMeta({ layout: 'counter' })

interface OverdueEntryView {
  reservation: { id: number; assetTypeId: number; period: { startDay: string; endDay: string } }
  rentalAgreement: { id: number; assetId: number }
  daysOverdue: number
  shortfallDay: string | null
  assetTypeName: string
  customerName: string
}

const requestFetch = useRequestFetch()
const nuxtApp = useNuxtApp()

const overdue = ref<OverdueEntryView[]>([])
const errorCode = ref<string | null>(null)
const errorMessage = ref<string | null>(null)
const info = ref<string | null>(null)

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
    const result = await requestFetch<{ overdue: OverdueEntryView[] }>('/api/handover/overdue')
    overdue.value = result.overdue
  } catch (err: unknown) {
    await handleFetchError(err)
  }
}

await load()

// ---------------------------------------------------------------------
// S-16 Declare lost, same sequence as the Asset view (S-13).
// ---------------------------------------------------------------------
const declareLostTarget = ref<OverdueEntryView | null>(null)
const showDeclareLostConfirm = ref(false)
const showDeclareLostPin = ref(false)
const declareLostReason = ref('')
const submittingDeclareLost = ref(false)

function startDeclareLost(entry: OverdueEntryView) {
  declareLostTarget.value = entry
  showDeclareLostConfirm.value = true
}

function onDeclareLostConfirm(reason: string | undefined) {
  declareLostReason.value = reason ?? ''
  showDeclareLostConfirm.value = false
  showDeclareLostPin.value = true
}

async function confirmDeclareLost(pin: string) {
  if (!declareLostTarget.value) return
  errorCode.value = null
  errorMessage.value = null
  submittingDeclareLost.value = true
  try {
    await $fetch(`/api/handover/rental-agreements/${declareLostTarget.value.rentalAgreement.id}/declare-lost`, {
      method: 'POST',
      body: { reason: declareLostReason.value, pin },
    })
    info.value = sk.assetHistory.declareLostSuccess
    declareLostTarget.value = null
    await load()
  } catch (err: unknown) {
    await handleFetchError(err)
  } finally {
    submittingDeclareLost.value = false
    showDeclareLostPin.value = false
  }
}
</script>

<template>
  <main>
    <StepHeader :title="sk.adminCounterOverdue.title" @back="navigateTo('/admin/counter')" />
    <AppAlert :code="errorCode" :message="errorMessage" />
    <p v-if="info">{{ info }}</p>
    <p>{{ sk.adminCounterOverdue.intro }}</p>

    <EmptyState v-if="overdue.length === 0" :message="sk.adminCounterOverdue.empty" />
    <TwoClockRow
      v-for="entry in overdue"
      :key="entry.reservation.id"
      :title="`${entry.customerName} — ${entry.assetTypeName}`"
      :expected-label="sk.adminCounter.expectedLabel"
      :expected-value="formatDayRange(entry.reservation.period.startDay, entry.reservation.period.endDay)"
      :actual-label="sk.adminCounter.actualLabelReturn"
      :actual-value="sk.adminCounterOverdue.actualValueOverdue"
    >
      <p>
        {{ sk.adminCounterOverdue.daysOverdueLabel }}: {{ entry.daysOverdue }}
        · {{ sk.adminCounterOverdue.shortfallLabel }}:
        <DerivedBadge v-if="entry.shortfallDay">{{ formatDay(entry.shortfallDay) }}</DerivedBadge>
        <span v-else>{{ sk.adminCounterOverdue.noShortfall }}</span>
      </p>
      <NuxtLink :to="`/admin/counter/assets/${entry.rentalAgreement.assetId}`">
        {{ sk.adminCounterOverdue.viewAssetAction }}
      </NuxtLink>
      <AppButton variant="danger" @click="startDeclareLost(entry)">
        {{ sk.assetHistory.declareLostAction }}
      </AppButton>
    </TwoClockRow>

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
