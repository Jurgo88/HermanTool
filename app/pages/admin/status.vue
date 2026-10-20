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
import { failureHint, jobHealth } from '~/utils/job-status'

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
// Failing jobs plus a backup that has never run (it cannot start at all).
const problemCount = computed(
  () =>
    statuses.value.filter((s) => jobHealth(s) === 'failing' || failureHint(s) === 'backupNotConfigured')
      .length,
)

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
    <h1 class="admin-status__title">{{ sk.adminStatus.title }}</h1>
    <AppAlert :message="error" />

    <!-- The one line an Operator needs first: is anything broken. -->
    <p
      v-if="statuses.length > 0"
      class="admin-status__summary"
      :class="problemCount > 0 ? 'admin-status__summary--problem' : 'admin-status__summary--ok'"
      role="status"
    >
      <span class="admin-status__summary-mark" aria-hidden="true" />
      {{
        problemCount > 0
          ? sk.adminStatus.summaryProblem.replace('{count}', String(problemCount))
          : sk.adminStatus.summaryOk
      }}
    </p>

    <section
      v-if="erasureStatus"
      class="admin-status__headline"
      :class="{ 'admin-status__headline--stale': erasureStale }"
    >
      <h2>{{ sk.adminStatus.erasureHeading }}</h2>
      <DerivedBadge v-if="erasureStale" tone="overdue">{{ sk.adminStatus.erasureStale }}</DerivedBadge>
      <p v-if="erasureStatus.latestSuccessfulRun">
        {{ sk.adminStatus.erasureFresh }}: {{ formatDateTime(erasureStatus.latestSuccessfulRun.startedAt) }}
      </p>
      <p v-else>{{ sk.adminStatus.erasureNever }}</p>
    </section>

    <section class="admin-status__jobs">
      <h2>{{ sk.adminStatus.otherJobsHeading }}</h2>
      <ul class="admin-status__list">
        <li v-for="status in otherStatuses" :key="status.jobName" class="admin-status__job">
          <div class="admin-status__job-head">
            <span class="admin-status__job-name">{{ sk.adminStatus.jobNames[status.jobName] }}</span>
            <span class="admin-status__chip" :class="`admin-status__chip--${jobHealth(status)}`">
              {{ sk.adminStatus.health[jobHealth(status)] }}
            </span>
          </div>
          <p class="admin-status__job-meta">
            <template v-if="status.latestRun">
              {{ sk.adminStatus.columnLastRun }}: {{ formatDateTime(status.latestRun.startedAt) }}
            </template>
            <template v-if="status.latestSuccessfulRun">
              · {{ sk.adminStatus.columnLastSuccess }}: {{ formatDateTime(status.latestSuccessfulRun.startedAt) }}
            </template>
            <template v-else-if="status.latestRun"> · {{ sk.adminStatus.neverSucceeded }} </template>
          </p>
          <p v-if="failureHint(status)" class="admin-status__hint">
            {{ sk.adminStatus.hints[failureHint(status)!] }}
          </p>
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.admin-status {
  max-width: 900px;
  margin: 0 auto;
  padding: var(--ht-space-5) var(--ht-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-5);
}

.admin-status__title {
  margin: 0;
}

.admin-status__summary {
  display: flex;
  align-items: center;
  gap: var(--ht-space-3);
  margin: 0;
  padding: var(--ht-space-3) var(--ht-space-4);
  border-radius: var(--ht-radius-card);
  font-weight: 600;
  color: var(--ht-on-brand);
}

.admin-status__summary--ok {
  background: var(--ht-ok);
}

.admin-status__summary--problem {
  background: var(--ht-danger);
}

.admin-status__summary-mark {
  flex: none;
  width: var(--ht-space-3);
  height: var(--ht-space-3);
  border-radius: 50%;
  background: var(--ht-on-brand);
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

.admin-status__headline h2,
.admin-status__headline p {
  margin: 0;
}

.admin-status__headline--stale {
  border-color: var(--ht-derived-overdue);
}

.admin-status__jobs h2 {
  margin: 0 0 var(--ht-space-3);
}

.admin-status__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--ht-line);
  border-radius: var(--ht-radius-card);
  background: var(--ht-surface);
}

.admin-status__job {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-1);
  padding: var(--ht-space-3) var(--ht-space-4);
}

.admin-status__job + .admin-status__job {
  border-top: 1px solid var(--ht-line);
}

.admin-status__job-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ht-space-3);
}

.admin-status__job-name {
  font-weight: 600;
}

.admin-status__job-meta {
  margin: 0;
  font-size: var(--ht-text-2);
  color: var(--ht-ink-muted);
}

/* Stored facts from the ledger: solid chips (FR-28's stored treatment). */
.admin-status__chip {
  flex: none;
  padding: var(--ht-space-1) var(--ht-space-2);
  border-radius: var(--ht-radius-plate);
  font-family: var(--ht-font-condensed);
  font-weight: 700;
  font-size: var(--ht-text-1);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ht-on-brand);
}

.admin-status__chip--ok {
  background: var(--ht-ok);
}

.admin-status__chip--failing {
  background: var(--ht-danger);
}

.admin-status__chip--never {
  background: var(--ht-warn);
}

.admin-status__hint {
  margin: var(--ht-space-1) 0 0;
  padding: var(--ht-space-2) var(--ht-space-3);
  border-left: var(--ht-space-1) solid var(--ht-danger);
  background: var(--ht-surface-sunk);
  font-size: var(--ht-text-2);
}
</style>
