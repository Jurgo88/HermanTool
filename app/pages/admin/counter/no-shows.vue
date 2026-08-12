<script setup lang="ts">
// S-15 (FR-30, W7; issue #119). States plainly that the RentalDays are
// NOT released — no cancellation path exists yet (W11, OQ #1). No action
// beyond contacting the Customer; none is invented here.
import { sk } from '~/i18n/sk'
import { getErrorCode } from '~/utils/error-code'
import { formatDayRange } from '~/utils/format'

definePageMeta({ layout: 'counter' })

interface NoShowEntryView {
  reservation: { id: number; assetTypeId: number; period: { startDay: string; endDay: string } }
  assetTypeName: string
  customerName: string
}

const requestFetch = useRequestFetch()
const nuxtApp = useNuxtApp()

const noShows = ref<NoShowEntryView[]>([])
const errorCode = ref<string | null>(null)
const errorMessage = ref<string | null>(null)

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

try {
  const result = await requestFetch<{ noShows: NoShowEntryView[] }>('/api/handover/no-shows')
  noShows.value = result.noShows
} catch (err: unknown) {
  await handleFetchError(err)
}
</script>

<template>
  <main>
    <StepHeader :title="sk.adminCounterNoShows.title" @back="navigateTo('/admin/counter')" />
    <AppAlert :code="errorCode" :message="errorMessage" />
    <p>{{ sk.adminCounterNoShows.note }}</p>

    <EmptyState v-if="noShows.length === 0" :message="sk.adminCounterNoShows.empty" />
    <TwoClockRow
      v-for="entry in noShows"
      :key="entry.reservation.id"
      :title="`${entry.customerName} — ${entry.assetTypeName}`"
      :expected-label="sk.adminCounter.expectedLabel"
      :expected-value="formatDayRange(entry.reservation.period.startDay, entry.reservation.period.endDay)"
      :actual-label="sk.adminCounter.actualLabelPickup"
      :actual-value="sk.adminCounter.actualValueNotPickedUp"
    />
  </main>
</template>
