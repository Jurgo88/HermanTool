<script setup lang="ts">
// S-25 Štatistiky (D-63, FR-28, D-38, D-21, D-51, P6; issue #211). Read-
// only: every figure comes from /api/admin/statistics/*, computed on the
// server; this page formats and sorts, it never counts days or derives a
// date. Overdue is a derived fact and gets DerivedBadge (D-47). Revenue is
// confirmed online Payments only; attested cash (deposits) sits on its
// own tile, never added in (P6).
import { sk } from '~/i18n/sk'
import {
  formatMonth,
  formatMoney,
  formatPercent,
  type MonetaryAmountView,
} from '~/utils/format'

definePageMeta({ layout: 'admin' })

interface OverviewView {
  month: string
  previousMonth: string
  revenueThisMonth: MonetaryAmountView[]
  revenueLastMonth: MonetaryAmountView[]
  utilisationThisMonth: number | null
  reservationsThisMonth: number
  outNow: number
  overdueNow: number
  depositsHeld: MonetaryAmountView[]
}

interface MonthRevenueView {
  month: string
  revenue: MonetaryAmountView[]
}

interface AssetTypeRow {
  assetTypeId: number
  name: string
  rentals: number
  rentedDays: number
  utilisation: number | null
  pool: number
  revenue: MonetaryAmountView[]
  unmetDemandDays: number
}

const nuxtApp = useNuxtApp()
const requestFetch = useRequestFetch()

const overview = ref<OverviewView | null>(null)
const months = ref<MonthRevenueView[]>([])
const overviewStatus = ref<'loading' | 'loaded' | 'error'>('loading')

async function onUnauthorised(err: unknown): Promise<boolean> {
  if ((err as { statusCode?: number })?.statusCode !== 401) return false
  await nuxtApp.runWithContext(() => navigateTo('/login?redirect=/admin/statistics'))
  return true
}

async function loadOverview() {
  overviewStatus.value = 'loading'
  try {
    const [loadedOverview, loadedMonths] = await Promise.all([
      requestFetch<OverviewView>('/api/admin/statistics/overview'),
      requestFetch<MonthRevenueView[]>('/api/admin/statistics/revenue-by-month'),
    ])
    overview.value = loadedOverview
    months.value = loadedMonths
    overviewStatus.value = 'loaded'
  } catch (err) {
    if (!(await onUnauthorised(err))) overviewStatus.value = 'error'
  }
}

await loadOverview()

const moneyList = (amounts: MonetaryAmountView[]) =>
  amounts.length > 0 ? amounts.map(formatMoney).join(' · ') : sk.adminStatistics.noValue

// One series, one hue (dataviz: a single series needs no legend; the
// heading names it). Bar heights are a share of the largest month.
const chartAmount = (entry: MonthRevenueView) => entry.revenue[0]?.amount ?? 0
const chartMax = computed(() => Math.max(1, ...months.value.map(chartAmount)))

// The range picker. Its values are passed to the server as typed; the
// server resolves them into RentalDays (D-12).
type RangeKind = 'month' | 'year' | 'custom'
const rangeKind = ref<RangeKind>('month')
const monthValue = ref(overview.value?.month ?? '')
const yearValue = ref(overview.value?.month.slice(0, 4) ?? '')
const startValue = ref('')
const endValue = ref('')

const rangeQuery = computed((): Record<string, string> => {
  if (rangeKind.value === 'month') return { kind: 'month', month: monthValue.value }
  if (rangeKind.value === 'year') return { kind: 'year', year: yearValue.value }
  return { kind: 'custom', startDay: startValue.value, endDay: endValue.value }
})

const rows = ref<AssetTypeRow[]>([])
const shownPeriod = ref<{ startDay: string; endDay: string } | null>(null)
const detailStatus = ref<'idle' | 'loading' | 'loaded' | 'error' | 'invalid'>('idle')

async function loadDetail() {
  detailStatus.value = 'loading'
  try {
    const result = await $fetch<{
      period: { startDay: string; endDay: string }
      assetTypes: AssetTypeRow[]
    }>('/api/admin/statistics/asset-types', { query: rangeQuery.value })
    rows.value = result.assetTypes
    shownPeriod.value = result.period
    detailStatus.value = 'loaded'
  } catch (err) {
    if (await onUnauthorised(err)) return
    detailStatus.value = (err as { statusCode?: number })?.statusCode === 400 ? 'invalid' : 'error'
  }
}

onMounted(() => {
  if (monthValue.value) loadDetail()
})

const exportHref = computed(() => {
  const query = new URLSearchParams(rangeQuery.value).toString()
  return `/api/admin/statistics/export.csv?${query}`
})

// "Čo zarába" — most revenue first; "Čo leží" — lowest utilisation first.
const sortBy = ref<'earns' | 'idle'>('earns')
const sortedRows = computed(() => {
  const revenueOf = (row: AssetTypeRow) => row.revenue[0]?.amount ?? 0
  const utilisationOf = (row: AssetTypeRow) => row.utilisation ?? -1
  return [...rows.value].sort((a, b) =>
    sortBy.value === 'earns'
      ? revenueOf(b) - revenueOf(a) || a.name.localeCompare(b.name, 'sk')
      : utilisationOf(a) - utilisationOf(b) || a.name.localeCompare(b.name, 'sk'),
  )
})
</script>

<template>
  <main class="statistics">
    <h1 class="statistics__title">{{ sk.adminStatistics.title }}</h1>

    <section class="statistics__section" aria-labelledby="statistics-overview-heading">
      <h2 id="statistics-overview-heading">
        {{ sk.adminStatistics.overviewHeading }}
        <template v-if="overview"> · {{ formatMonth(overview.month) }}</template>
      </h2>

      <p v-if="overviewStatus === 'loading'" aria-busy="true">{{ sk.adminStatistics.loading }}</p>
      <div v-else-if="overviewStatus === 'error'" class="statistics__error">
        <AppAlert :message="sk.adminStatistics.loadError" />
        <AppButton variant="secondary" @click="loadOverview">
          {{ sk.adminStatistics.retryAction }}
        </AppButton>
      </div>

      <div v-else-if="overview" class="statistics__tiles">
        <article class="statistics__tile">
          <h3>{{ sk.adminStatistics.revenueThisMonth }}</h3>
          <p class="statistics__figure">{{ moneyList(overview.revenueThisMonth) }}</p>
          <p class="statistics__note">
            {{
              sk.adminStatistics.revenueLastMonth.replace(
                '{amount}',
                moneyList(overview.revenueLastMonth),
              )
            }}
          </p>
          <p class="statistics__note">{{ sk.adminStatistics.revenueNote }}</p>
        </article>
        <article class="statistics__tile">
          <h3>{{ sk.adminStatistics.utilisation }}</h3>
          <p class="statistics__figure">
            {{
              overview.utilisationThisMonth === null
                ? sk.adminStatistics.noValue
                : formatPercent(overview.utilisationThisMonth)
            }}
          </p>
          <p class="statistics__note">{{ sk.adminStatistics.utilisationNote }}</p>
        </article>
        <article class="statistics__tile">
          <h3>{{ sk.adminStatistics.reservationsThisMonth }}</h3>
          <p class="statistics__figure">{{ overview.reservationsThisMonth }}</p>
        </article>
        <article class="statistics__tile">
          <h3>{{ sk.adminStatistics.outNow }}</h3>
          <p class="statistics__figure">{{ overview.outNow }}</p>
          <DerivedBadge v-if="overview.overdueNow > 0" tone="overdue">
            {{ overview.overdueNow }} {{ sk.adminStatistics.overdueNow }}
          </DerivedBadge>
        </article>
        <article class="statistics__tile">
          <h3>{{ sk.adminStatistics.depositsHeld }}</h3>
          <p class="statistics__figure">{{ moneyList(overview.depositsHeld) }}</p>
          <p class="statistics__note">{{ sk.adminStatistics.depositsNote }}</p>
        </article>
      </div>
    </section>

    <section
      v-if="months.length > 0"
      class="statistics__section"
      aria-labelledby="statistics-chart-heading"
    >
      <h2 id="statistics-chart-heading">{{ sk.adminStatistics.chartHeading }}</h2>
      <ol class="statistics__chart">
        <li
          v-for="entry in months"
          :key="entry.month"
          class="statistics__bar-slot"
          tabindex="0"
          :aria-label="`${formatMonth(entry.month)}: ${moneyList(entry.revenue)}`"
        >
          <span class="statistics__bar-value">{{ moneyList(entry.revenue) }}</span>
          <span
            class="statistics__bar"
            :style="{ height: `${(chartAmount(entry) / chartMax) * 100}%` }"
            aria-hidden="true"
          />
          <span class="statistics__bar-label" aria-hidden="true">{{
            formatMonth(entry.month)
          }}</span>
        </li>
      </ol>
      <details class="statistics__chart-table">
        <summary>{{ sk.adminStatistics.chartTableToggle }}</summary>
        <AppTable>
          <thead>
            <tr>
              <th scope="col">{{ sk.adminStatistics.chartMonth }}</th>
              <th scope="col">{{ sk.adminStatistics.chartRevenue }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in months" :key="entry.month">
              <td>{{ formatMonth(entry.month) }}</td>
              <td>{{ moneyList(entry.revenue) }}</td>
            </tr>
          </tbody>
        </AppTable>
      </details>
    </section>

    <section class="statistics__section" aria-labelledby="statistics-detail-heading">
      <h2 id="statistics-detail-heading">{{ sk.adminStatistics.detailHeading }}</h2>

      <form class="statistics__range" @submit.prevent="loadDetail">
        <AppField :label="sk.adminStatistics.rangeLabel">
          <template #default="slotProps">
            <select :id="slotProps.id" v-model="rangeKind">
              <option value="month">{{ sk.adminStatistics.rangeKinds.month }}</option>
              <option value="year">{{ sk.adminStatistics.rangeKinds.year }}</option>
              <option value="custom">{{ sk.adminStatistics.rangeKinds.custom }}</option>
            </select>
          </template>
        </AppField>
        <AppField v-if="rangeKind === 'month'" :label="sk.adminStatistics.monthLabel">
          <template #default="slotProps">
            <input :id="slotProps.id" v-model="monthValue" type="month" required />
          </template>
        </AppField>
        <AppField v-else-if="rangeKind === 'year'" :label="sk.adminStatistics.yearLabel">
          <template #default="slotProps">
            <input
              :id="slotProps.id"
              v-model="yearValue"
              type="text"
              inputmode="numeric"
              pattern="\d{4}"
              required
            />
          </template>
        </AppField>
        <template v-else>
          <AppField :label="sk.adminStatistics.startLabel">
            <template #default="slotProps">
              <input :id="slotProps.id" v-model="startValue" type="date" required />
            </template>
          </AppField>
          <AppField :label="sk.adminStatistics.endLabel">
            <template #default="slotProps">
              <input :id="slotProps.id" v-model="endValue" type="date" required />
            </template>
          </AppField>
        </template>
        <AppButton type="submit" :pending="detailStatus === 'loading'">
          {{ sk.adminStatistics.showAction }}
        </AppButton>
        <a class="statistics__export" :href="exportHref" download>
          {{ sk.adminStatistics.exportAction }}
        </a>
      </form>

      <p v-if="detailStatus === 'loading'" aria-busy="true">{{ sk.adminStatistics.loading }}</p>
      <AppAlert v-else-if="detailStatus === 'invalid'" :message="sk.adminStatistics.rangeError" />
      <div v-else-if="detailStatus === 'error'" class="statistics__error">
        <AppAlert :message="sk.adminStatistics.loadError" />
        <AppButton variant="secondary" @click="loadDetail">
          {{ sk.adminStatistics.retryAction }}
        </AppButton>
      </div>
      <p v-else-if="detailStatus === 'loaded' && rows.length === 0">
        {{ sk.adminStatistics.empty }}
      </p>

      <template v-if="detailStatus === 'loaded' && rows.length > 0">
        <div class="statistics__sort" role="group" :aria-label="sk.adminStatistics.sortLabel">
          <AppButton
            :variant="sortBy === 'earns' ? 'primary' : 'quiet'"
            :aria-pressed="sortBy === 'earns'"
            @click="sortBy = 'earns'"
          >
            {{ sk.adminStatistics.sortEarns }}
          </AppButton>
          <AppButton
            :variant="sortBy === 'idle' ? 'primary' : 'quiet'"
            :aria-pressed="sortBy === 'idle'"
            @click="sortBy = 'idle'"
          >
            {{ sk.adminStatistics.sortIdle }}
          </AppButton>
          <span v-if="shownPeriod" class="statistics__note">
            <DayRange :start-day="shownPeriod.startDay" :end-day="shownPeriod.endDay" />
          </span>
        </div>
        <AppTable>
          <thead>
            <tr>
              <th scope="col">{{ sk.adminStatistics.columnName }}</th>
              <th scope="col">{{ sk.adminStatistics.columnRentals }}</th>
              <th scope="col">{{ sk.adminStatistics.columnRentedDays }}</th>
              <th scope="col">{{ sk.adminStatistics.columnUtilisation }}</th>
              <th scope="col">{{ sk.adminStatistics.columnRevenue }}</th>
              <th scope="col" :title="sk.adminStatistics.unmetHint">
                {{ sk.adminStatistics.columnUnmet }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in sortedRows" :key="row.assetTypeId">
              <th scope="row">{{ row.name }}</th>
              <td>{{ row.rentals }}</td>
              <td>{{ row.rentedDays }}</td>
              <td>
                {{
                  row.utilisation === null
                    ? sk.adminStatistics.noValue
                    : formatPercent(row.utilisation)
                }}
              </td>
              <td>{{ moneyList(row.revenue) }}</td>
              <td>{{ row.unmetDemandDays }}</td>
            </tr>
          </tbody>
        </AppTable>
        <p class="statistics__note">{{ sk.adminStatistics.unmetHint }}</p>
        <p class="statistics__note">{{ sk.adminStatistics.poolNote }}</p>
      </template>
    </section>
  </main>
</template>

<style scoped>
.statistics {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-6);
  padding: var(--ht-space-5) var(--ht-space-4);
}

.statistics__title {
  margin: 0;
  font-size: var(--ht-text-5);
}

.statistics__section {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-3);
}

.statistics__section h2 {
  margin: 0;
  font-size: var(--ht-text-4);
}

.statistics__tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
  gap: var(--ht-space-3);
}

.statistics__tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ht-space-1);
  padding: var(--ht-space-4);
  background: var(--ht-surface);
  border: var(--ht-line-width) solid var(--ht-line);
  border-radius: var(--ht-radius-card);
}

.statistics__tile h3 {
  margin: 0;
  font-size: var(--ht-text-2);
  color: var(--ht-ink-muted);
  font-weight: 600;
}

.statistics__figure {
  margin: 0;
  font-family: var(--ht-font-money);
  font-size: var(--ht-text-5);
  font-variant-numeric: tabular-nums;
}

.statistics__note {
  margin: 0;
  font-size: var(--ht-text-1);
  color: var(--ht-ink-muted);
}

.statistics__error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ht-space-2);
}

.statistics__chart {
  list-style: none;
  margin: 0;
  padding: var(--ht-space-4) 0 0;
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: var(--ht-space-1);
  align-items: end;
  height: 12rem;
  border-bottom: var(--ht-line-width) solid var(--ht-line-strong);
}

.statistics__bar-slot {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
}

.statistics__bar-slot:focus-visible {
  outline: var(--ht-focus-ring-width) solid var(--ht-brand);
  outline-offset: var(--ht-focus-ring-offset);
}

.statistics__bar {
  width: 60%;
  min-height: var(--ht-line-width);
  background: var(--ht-brand);
  border-radius: var(--ht-radius-plate) var(--ht-radius-plate) 0 0;
}

/* The value shows on hover or focus only — never a number on every bar. */
.statistics__bar-value {
  position: absolute;
  top: 0;
  padding: var(--ht-space-1);
  background: var(--ht-surface);
  border: var(--ht-line-width) solid var(--ht-line);
  border-radius: var(--ht-radius-plate);
  font-size: var(--ht-text-1);
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
}

.statistics__bar-slot:hover .statistics__bar-value,
.statistics__bar-slot:focus-visible .statistics__bar-value {
  opacity: 1;
}

.statistics__bar-label {
  position: absolute;
  bottom: calc(-1 * var(--ht-space-5));
  font-size: var(--ht-text-1);
  color: var(--ht-ink-muted);
  white-space: nowrap;
  overflow: hidden;
  max-width: 100%;
  text-overflow: ellipsis;
}

.statistics__chart-table {
  margin-top: var(--ht-space-5);
}

.statistics__range {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--ht-space-3);
}

.statistics__export {
  color: var(--ht-brand);
  font-weight: 600;
}

.statistics__sort {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ht-space-2);
}
</style>
