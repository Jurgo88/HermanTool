<script setup lang="ts">
// S-02 AssetType detail (FR-02, FR-03, D-55, D-57, D-58, W1; issue #157).
// A Visitor sees the D-55 content, day rate and deposit with equal weight
// (FR-02), a month calendar of derived levels and the Accessories. The
// period is picked first day, then last day. Before anything enters the
// draft, the exact period is checked on the server for the principal and
// every chosen Accessory at the chosen quantity. The calendar is advisory
// and D-33's hold at checkout remains the authority. Terms are accepted
// at checkout (D-35), never here.
import { sk } from '~/i18n/sk'
import type { MonetaryAmountView } from '~/utils/format'
import type { CalendarMonth } from '~/components/AvailabilityCalendar.vue'

definePageMeta({ layout: 'public' })

interface AccessoryView {
  id: number
  name: string
  dayRate: MonetaryAmountView
  depositAmount: MonetaryAmountView
  imageFile: string | null
}

interface AssetTypeDetailView {
  id: number
  name: string
  description: string
  dayRate: MonetaryAmountView
  depositAmount: MonetaryAmountView
  specifications: { label: string; value: string }[]
  includedContents: string
  handlingNotice: string
  imageFile: string | null
  accessories: AccessoryView[]
}

const route = useRoute()
const assetTypeId = Number(route.params.id)

// The current month arrives with the page, in parallel with the detail; the
// server picks the month when none is given.
const calendarUrl = `/api/public/asset-types/${assetTypeId}/availability/month`
const [{ data: assetType, error: loadError }, { data: firstMonth }] = await Promise.all([
  useFetch<AssetTypeDetailView>(`/api/public/asset-types/${assetTypeId}`),
  useFetch<CalendarMonth>(calendarUrl),
])
if (loadError.value?.statusCode === 404) {
  throw createError({ statusCode: 404, statusMessage: 'Not found', fatal: true })
}

const calendar = ref<CalendarMonth | null>(firstMonth.value ?? null)
const calendarStatus = ref<'loading' | 'loaded' | 'error'>(firstMonth.value ? 'loaded' : 'loading')

// Months already seen stay for the life of the page, and the next one is
// fetched ahead, so paging is instant. Advisory only: the period check and
// the checkout hold always ask the server again.
const monthCache = new Map<string, Promise<CalendarMonth>>()
let latestRequest: string | undefined

function fetchMonth(month?: string): Promise<CalendarMonth> {
  if (!month) return $fetch<CalendarMonth>(calendarUrl)
  let pending = monthCache.get(month)
  if (!pending) {
    pending = $fetch<CalendarMonth>(calendarUrl, { query: { month } })
    pending.catch(() => monthCache.delete(month))
    monthCache.set(month, pending)
  }
  return pending
}

function remember(loaded: CalendarMonth) {
  monthCache.set(loaded.month, Promise.resolve(loaded))
  fetchMonth(loaded.nextMonth).catch(() => {})
}

async function loadMonth(month?: string) {
  latestRequest = month
  calendarStatus.value = 'loading'
  try {
    const loaded = await fetchMonth(month)
    if (latestRequest !== month) return
    calendar.value = loaded
    calendarStatus.value = 'loaded'
    remember(loaded)
  } catch {
    if (latestRequest === month) calendarStatus.value = 'error'
  }
}

onMounted(() => {
  if (calendar.value) remember(calendar.value)
  else loadMonth()
})

// Period: first pick is the start, the second the end (the same day again
// makes a one-day rental); a pick before the start restarts.
const startDay = ref<string | null>(null)
const endDay = ref<string | null>(null)

function pick(day: string) {
  added.value = false
  if (!startDay.value || endDay.value || day < startDay.value) {
    startDay.value = day
    endDay.value = null
  } else {
    endDay.value = day
  }
}

const quantity = ref(1)
const chosenAccessoryIds = ref<number[]>([])

// The exact period, checked on the server for every AssetType involved.
type RangeStatus = 'idle' | 'checking' | 'ok' | 'unavailable' | 'error'
const rangeStatus = ref<RangeStatus>('idle')
const accessoryFits = ref<Record<number, boolean>>({})

async function minAvailable(
  id: number,
  period: { startDay: string; endDay: string },
): Promise<number> {
  const result = await $fetch<{ days: { available: number }[] }>(
    `/api/public/asset-types/${id}/availability`,
    {
      query: period,
    },
  )
  return result.days.reduce((min, day) => Math.min(min, day.available), Number.POSITIVE_INFINITY)
}

async function checkRange() {
  if (!assetType.value || !startDay.value || !endDay.value) {
    rangeStatus.value = 'idle'
    return
  }
  const period = { startDay: startDay.value, endDay: endDay.value }
  rangeStatus.value = 'checking'
  try {
    const [principal, ...accessories] = await Promise.all([
      minAvailable(assetType.value.id, period),
      ...assetType.value.accessories.map((accessory) => minAvailable(accessory.id, period)),
    ])
    accessoryFits.value = Object.fromEntries(
      assetType.value.accessories.map((accessory, i) => [
        accessory.id,
        (accessories[i] ?? 0) >= quantity.value,
      ]),
    )
    chosenAccessoryIds.value = chosenAccessoryIds.value.filter((id) => accessoryFits.value[id])
    rangeStatus.value = (principal ?? 0) >= quantity.value ? 'ok' : 'unavailable'
  } catch {
    rangeStatus.value = 'error'
  }
}

watch([startDay, endDay, quantity], checkRange)

const added = ref(false)
const { addLine } = useReservationDraft()

function reserve() {
  if (!assetType.value || !startDay.value || !endDay.value || rangeStatus.value !== 'ok') return
  const period = { startDay: startDay.value, endDay: endDay.value }
  addLine({
    assetTypeId: assetType.value.id,
    assetTypeName: assetType.value.name,
    dayRate: assetType.value.dayRate,
    depositAmount: assetType.value.depositAmount,
    period,
    quantity: quantity.value,
  })
  for (const accessory of assetType.value.accessories) {
    if (!chosenAccessoryIds.value.includes(accessory.id)) continue
    addLine({
      assetTypeId: accessory.id,
      assetTypeName: accessory.name,
      dayRate: accessory.dayRate,
      depositAmount: accessory.depositAmount,
      period,
      quantity: quantity.value,
      principalAssetTypeId: assetType.value.id,
    })
  }
  added.value = true
}

const hint = computed(() => {
  if (!startDay.value) return sk.assetTypeDetail.pickStartHint
  if (!endDay.value) return sk.assetTypeDetail.pickEndHint
  return null
})
</script>

<template>
  <main class="detail">
    <NuxtLink to="/" class="detail__back">{{ sk.assetTypeDetail.backToCatalog }}</NuxtLink>

    <AppAlert v-if="loadError" :message="sk.assetTypeDetail.loadError" />

    <template v-else-if="assetType">
      <h1 class="detail__title">{{ assetType.name }}</h1>

      <div class="detail__columns">
        <section class="detail__content">
          <div class="detail__image">
            <img
              v-if="assetType.imageFile"
              :src="`/catalog/${assetType.imageFile}`"
              alt=""
              width="800"
              height="800"
            />
            <span v-else class="detail__placeholder">{{ sk.publicCatalog.imagePlaceholder }}</span>
          </div>

          <p v-if="assetType.includedContents" class="detail__included">
            {{ sk.assetTypeDetail.includedLabel }}: {{ assetType.includedContents }}
          </p>
          <p v-if="assetType.handlingNotice" class="detail__notice" role="note">
            {{ assetType.handlingNotice }}
          </p>
          <p v-if="assetType.description">{{ assetType.description }}</p>

          <template v-if="assetType.specifications.length > 0">
            <h2>{{ sk.assetTypeDetail.specificationsHeading }}</h2>
            <dl class="detail__specs">
              <template v-for="spec in assetType.specifications" :key="spec.label">
                <dt>{{ spec.label }}</dt>
                <dd>{{ spec.value }}</dd>
              </template>
            </dl>
          </template>
        </section>

        <section class="detail__reserve">
          <h2>{{ sk.assetTypeDetail.calendarHeading }}</h2>
          <AvailabilityCalendar
            :month="calendar"
            :status="calendarStatus"
            :start-day="startDay"
            :end-day="endDay"
            @pick="pick"
            @navigate="loadMonth"
          />
          <p v-if="hint" class="detail__hint">{{ hint }}</p>
          <p v-else-if="startDay && endDay">
            {{ sk.assetTypeDetail.selectedPeriodLabel }}:
            <DayRange :start-day="startDay" :end-day="endDay" />
          </p>

          <AppField :label="sk.assetTypeDetail.quantityLabel">
            <template #default="slotProps">
              <input
                :id="slotProps.id"
                v-model.number="quantity"
                type="number"
                min="1"
                max="50"
                step="1"
              />
            </template>
          </AppField>

          <fieldset v-if="assetType.accessories.length > 0" class="detail__accessories">
            <legend>{{ sk.assetTypeDetail.accessoriesHeading }}</legend>
            <label
              v-for="accessory in assetType.accessories"
              :key="accessory.id"
              class="detail__accessory"
            >
              <input
                v-model="chosenAccessoryIds"
                type="checkbox"
                :value="accessory.id"
                :disabled="rangeStatus !== 'ok' || !accessoryFits[accessory.id]"
              />
              <span>
                {{ accessory.name }} · <MoneyAmount :amount="accessory.dayRate" />
                {{ sk.assetTypeDetail.perDaySuffix }}, {{ sk.assetTypeDetail.depositLabel }}
                <MoneyAmount :amount="accessory.depositAmount" />
                <small v-if="rangeStatus !== 'ok'" class="detail__reason">
                  {{ sk.assetTypeDetail.accessoryPickPeriodFirst }}
                </small>
                <small v-else-if="!accessoryFits[accessory.id]" class="detail__reason">
                  {{ sk.assetTypeDetail.accessoryUnavailable }}
                </small>
              </span>
            </label>
          </fieldset>

          <div class="detail__prices">
            <div>
              <span class="detail__price-label">{{ sk.assetTypeDetail.dayRateLabel }}</span>
              <MoneyAmount :amount="assetType.dayRate" size="large" />
            </div>
            <div>
              <span class="detail__price-label">{{ sk.assetTypeDetail.depositLabel }}</span>
              <MoneyAmount :amount="assetType.depositAmount" size="large" />
            </div>
          </div>
          <p class="detail__hint">{{ sk.assetTypeDetail.depositNote }}</p>

          <p v-if="rangeStatus === 'checking'" aria-busy="true">
            {{ sk.assetTypeDetail.rangeChecking }}
          </p>
          <AppAlert
            v-else-if="rangeStatus === 'unavailable'"
            variant="warn"
            :message="sk.assetTypeDetail.rangeUnavailable"
          />
          <AppAlert v-else-if="rangeStatus === 'error'" :message="sk.assetTypeDetail.rangeError" />

          <AppButton
            variant="primary"
            :pending="rangeStatus === 'checking'"
            :disabled="rangeStatus !== 'ok'"
            @click="reserve"
          >
            {{ sk.assetTypeDetail.reserveAction }}
          </AppButton>
          <p v-if="added" class="detail__added" role="status">
            {{ sk.assetTypeDetail.added }}
            <NuxtLink to="/checkout">{{ sk.assetTypeDetail.goToCheckout }}</NuxtLink>
          </p>

          <NuxtLink to="/podmienky" class="detail__terms">{{
            sk.assetTypeDetail.termsLink
          }}</NuxtLink>
        </section>
      </div>
    </template>
  </main>
</template>

<style scoped>
.detail {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--ht-space-5) var(--ht-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-4);
}

.detail__back,
.detail__terms {
  color: var(--ht-brand);
  font-weight: 600;
}

.detail__columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ht-space-6);
}

@media (min-width: 900px) {
  .detail__columns {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
}

.detail__content,
.detail__reserve {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-4);
}

.detail__image {
  aspect-ratio: 1;
  max-width: 480px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ht-surface);
  border-radius: var(--ht-radius-card);
}

.detail__image img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.detail__placeholder {
  color: var(--ht-ink-muted);
}

.detail__included {
  color: var(--ht-brand);
  font-weight: 600;
}

.detail__notice {
  border: 2px solid var(--ht-danger);
  border-radius: var(--ht-radius-card);
  padding: var(--ht-space-2) var(--ht-space-3);
  color: var(--ht-danger);
  font-weight: 600;
}

.detail__specs {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--ht-space-1) var(--ht-space-4);
  margin: 0;
}

.detail__specs dt {
  color: var(--ht-ink-muted);
}

.detail__specs dd {
  margin: 0;
}

.detail__hint,
.detail__reason {
  color: var(--ht-ink-muted);
  font-size: var(--ht-text-2);
}

.detail__reason {
  display: block;
}

.detail__accessories {
  border: 1px solid var(--ht-line);
  border-radius: var(--ht-radius-card);
  padding: var(--ht-space-3);
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-2);
}

.detail__accessory {
  display: flex;
  gap: var(--ht-space-2);
  align-items: flex-start;
  min-height: var(--ht-hit-min);
}

.detail__accessory input {
  width: var(--ht-space-5);
  height: var(--ht-space-5);
}

.detail__prices {
  display: flex;
  gap: var(--ht-space-6);
}

.detail__price-label {
  display: block;
  font-family: var(--ht-font-condensed);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: var(--ht-text-1);
  color: var(--ht-ink-muted);
}

.detail__added {
  color: var(--ht-ok);
  font-weight: 600;
}
</style>
