<script setup lang="ts">
// Platform status page (D-41, FR-40 Must, FR-44 Should, NFR-14, S-21;
// issue #74/IR-06, renamed from job-runs per WP-5.4). Every request goes
// through GET /api/admin/job-runs (route path unchanged — only this
// page moved), which gates on requireOperator — a 401 here means the
// session is missing or expired, so this page sends the Operator back
// to /login rather than showing an error.
//
// NFR-14's own argument: every other failure in this product is loud —
// a scan fails, a payment fails, the Operator sees it. The erasure job
// is the one silent failure (nothing breaks, nobody complains, a GDPR
// liability accrues invisibly), so its last successful run is this
// page's headline, not a row in a table with the rest.
import { sk } from '~/i18n/sk'
import { formatDateTime } from '~/utils/format'

definePageMeta({ layout: 'admin' })

type JobName =
  | 'expiry_sweep'
  | 'evidence_erasure'
  | 'pickup_reminder_dispatch'
  | 'return_reminder_dispatch'
  | 'overdue_reminder_dispatch'
  | 'database_backup'
  | 'unconfirmed_identity_evidence_sweep'
  | 'unconfirmed_condition_report_sweep'

interface JobRunView {
  startedAt: string
  finishedAt: string
  outcome: 'success' | 'failure'
  processedCount: number
  errorMessage: string | null
}

interface JobRunStatusView {
  jobName: JobName
  latestRun: JobRunView | null
  latestSuccessfulRun: JobRunView | null
}

const nuxtApp = useNuxtApp()
const requestFetch = useRequestFetch()

const statuses = ref<JobRunStatusView[]>([])
const error = ref<string | null>(null)

const erasureStatus = computed(() => statuses.value.find((s) => s.jobName === 'evidence_erasure') ?? null)
const otherStatuses = computed(() => statuses.value.filter((s) => s.jobName !== 'evidence_erasure'))

// The erasure job runs daily at 03:00 UTC
// (.github/workflows/erase-expired-identity-evidence.yml) — "stale"
// means later than one scheduled run plus a couple of hours' grace for
// a delayed CI run, not an arbitrary guess.
const ERASURE_STALE_THRESHOLD_HOURS = 26

const erasureStale = computed(() => {
  const lastSuccess = erasureStatus.value?.latestSuccessfulRun
  if (!lastSuccess) return true
  const hoursSince = (Date.now() - new Date(lastSuccess.startedAt).getTime()) / (60 * 60 * 1000)
  return hoursSince > ERASURE_STALE_THRESHOLD_HOURS
})

async function handleFetchError(err: unknown) {
  const statusCode = (err as { statusCode?: number })?.statusCode
  if (statusCode === 401) {
    await nuxtApp.runWithContext(() => navigateTo('/login'))
    return
  }
  error.value = sk.common.somethingWentWrong
}

async function load() {
  try {
    statuses.value = await requestFetch<JobRunStatusView[]>('/api/admin/job-runs')
  } catch (err: unknown) {
    await handleFetchError(err)
  }
}

await load()
</script>

<template>
  <main class="admin-status">
    <h1>{{ sk.adminStatus.title }}</h1>
    <AppAlert :message="error" />

    <section v-if="erasureStatus" class="admin-status__headline" :class="{ 'admin-status__headline--stale': erasureStale }">
      <h2>{{ sk.adminStatus.erasureHeading }}</h2>
      <DerivedBadge v-if="erasureStale" tone="overdue">{{ sk.adminStatus.erasureStale }}</DerivedBadge>
      <p v-if="erasureStatus.latestSuccessfulRun">
        {{ sk.adminStatus.erasureFresh }}: {{ formatDateTime(erasureStatus.latestSuccessfulRun.startedAt) }}
      </p>
      <p v-else>{{ sk.adminStatus.erasureNever }}</p>
    </section>

    <section>
      <h2>{{ sk.adminStatus.otherJobsHeading }}</h2>
      <AppTable>
        <thead>
          <tr>
            <th>{{ sk.adminStatus.columnJob }}</th>
            <th>{{ sk.adminStatus.columnLastRun }}</th>
            <th>{{ sk.adminStatus.columnLastSuccess }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="status in otherStatuses" :key="status.jobName">
            <td>{{ sk.adminStatus.jobNames[status.jobName] }}</td>
            <td>
              <span v-if="status.latestRun">
                {{ formatDateTime(status.latestRun.startedAt) }} —
                {{ status.latestRun.outcome === 'success' ? sk.adminStatus.outcomeSuccess : sk.adminStatus.outcomeFailure }}
              </span>
              <span v-else>{{ sk.adminStatus.neverRun }}</span>
            </td>
            <td>
              <span v-if="status.latestSuccessfulRun">{{ formatDateTime(status.latestSuccessfulRun.startedAt) }}</span>
              <span v-else>{{ sk.adminStatus.neverRun }}</span>
            </td>
          </tr>
        </tbody>
      </AppTable>
    </section>
  </main>
</template>

<style scoped>
.admin-status {
  max-width: 900px;
  margin: 0 auto;
  padding: var(--ht-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-6);
}

.admin-status__headline {
  background: var(--ht-surface);
  border: 1px solid var(--ht-line);
  border-radius: var(--ht-radius-card);
  padding: var(--ht-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-2);
}

.admin-status__headline--stale {
  border-color: var(--ht-derived-overdue);
}
</style>
