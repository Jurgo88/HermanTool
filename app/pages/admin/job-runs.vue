<script setup lang="ts">
// Job-run status page (D-41, FR-40 Must, FR-44 Should; issue #74/IR-06).
// Every request goes through GET /api/admin/job-runs, which gates on
// requireOperator — a 401 here means the session is missing or expired,
// so this page sends the Operator back to /login rather than showing an
// error, mirroring ./catalog.vue exactly.
import { sk } from '~/i18n/sk'

type JobName =
  | 'expiry_sweep'
  | 'evidence_erasure'
  | 'pickup_reminder_dispatch'
  | 'return_reminder_dispatch'
  | 'overdue_reminder_dispatch'
  | 'database_backup'

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

function formatWhen(iso: string | null): string {
  if (!iso) return sk.adminJobRuns.neverRun
  return new Date(iso).toLocaleString('sk-SK')
}

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
  <main>
    <h1>{{ sk.adminJobRuns.title }}</h1>
    <p v-if="error" role="alert">{{ error }}</p>

    <table>
      <thead>
        <tr>
          <th>{{ sk.adminJobRuns.columnJob }}</th>
          <th>{{ sk.adminJobRuns.columnLastRun }}</th>
          <th>{{ sk.adminJobRuns.columnLastSuccess }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="status in statuses" :key="status.jobName">
          <td>{{ sk.adminJobRuns.jobNames[status.jobName] }}</td>
          <td>
            <span v-if="status.latestRun">
              {{ formatWhen(status.latestRun.startedAt) }} —
              {{ status.latestRun.outcome === 'success' ? sk.adminJobRuns.outcomeSuccess : sk.adminJobRuns.outcomeFailure }}
            </span>
            <span v-else>{{ sk.adminJobRuns.neverRun }}</span>
          </td>
          <td>{{ formatWhen(status.latestSuccessfulRun?.startedAt ?? null) }}</td>
        </tr>
      </tbody>
    </table>
  </main>
</template>
