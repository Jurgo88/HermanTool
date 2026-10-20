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
import { formatCount, formatMoney, type MonetaryAmountView } from '~/utils/format'
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

// The sum for the picked period, principal and chosen Accessories, from the
// same server quote checkout and Stripe use (#164) — this page counts no
// days and multiplies no rates (D-51).
interface PeriodQuote {
  lines: { days: number }[]
  rentalFeeTotal: MonetaryAmountView
  depositTotal: MonetaryAmountView
}
const periodQuote = ref<PeriodQuote | null>(null)
let quoteRequest = 0

async function loadPeriodQuote() {
  const request = ++quoteRequest
  if (!assetType.value || !startDay.value || !endDay.value || rangeStatus.value !== 'ok') {
    periodQuote.value = null
    return
  }
  const period = { startDay: startDay.value, endDay: endDay.value }
  const ids = [assetType.value.id, ...chosenAccessoryIds.value]
  try {
    const quote = await $fetch<PeriodQuote>('/api/public/reservation-quote', {
      method: 'POST',
      body: { lines: ids.map((id) => ({ assetTypeId: id, period, quantity: quantity.value })) },
    })
    if (request === quoteRequest) periodQuote.value = quote
  } catch {
    if (request === quoteRequest) periodQuote.value = null
  }
}

watch([rangeStatus, chosenAccessoryIds], loadPeriodQuote, { deep: true })

// The first specifications become figures under the photo; the full list
// stays below.
const highlights = computed(() => assetType.value?.specifications.slice(0, 4) ?? [])
const quantityId = useId()

const periodDays = computed(() => periodQuote.value?.lines[0]?.days ?? null)

// After adding, the bar offers the next step instead of the same button, so
// a second tap cannot add the same period twice. Any change starts over.
const added = ref(false)
watch([quantity, chosenAccessoryIds], () => (added.value = false), { deep: true })
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

function pickAnother() {
  added.value = false
  startDay.value = null
  endDay.value = null
  chosenAccessoryIds.value = []
}

const hint = computed(() => {
  if (!startDay.value) return sk.assetTypeDetail.pickStartHint
  if (!endDay.value) return sk.assetTypeDetail.pickEndHint
  return null
})
</script>

<template>
  <main class="detail">
    <header class="detail__head">
      <NuxtLink to="/" class="detail__back">{{ sk.assetTypeDetail.backToCatalog }}</NuxtLink>
      <template v-if="assetType">
        <h1 class="detail__title">{{ assetType.name }}</h1>
        <p v-if="assetType.description" class="detail__lead">{{ assetType.description }}</p>
        <!-- FR-02, S-02: the day rate and the cash deposit with equal weight. -->
        <div class="detail__chips">
          <span class="detail__chip detail__chip--rate">
            {{ sk.assetTypeDetail.rateChip.replace('{amount}', formatMoney(assetType.dayRate)) }}
          </span>
          <span class="detail__chip">
            {{ sk.assetTypeDetail.depositChip.replace('{amount}', formatMoney(assetType.depositAmount)) }}
          </span>
        </div>
      </template>
    </header>

    <div class="detail__body">
      <AppAlert v-if="loadError" :message="sk.assetTypeDetail.loadError" />

      <!-- Phone: one column — photo, the reservation card, details, and a bar
        floating at the bottom with the sum and the button. Wide screens: the
        photo and details on the left, the card and the bar on the right.
        .detail__side is only a wrapper on a phone
        (display: contents), so its children take part in the page order. -->
      <div v-else-if="assetType" class="detail__layout">
        <section class="detail__intro">
          <div class="detail__image" :class="{ 'detail__image--empty': !assetType.imageFile }">
            <img
              v-if="assetType.imageFile"
              :src="`/catalog/${assetType.imageFile}`"
              alt=""
              width="800"
              height="800"
            />
            <span v-else>{{ sk.publicCatalog.imagePlaceholder }}</span>
          </div>

          <ul v-if="highlights.length > 0" class="detail__highlights">
            <li v-for="spec in highlights" :key="spec.label">
              <strong>{{ spec.value }}</strong>
              <span>{{ spec.label }}</span>
            </li>
          </ul>

          <p v-if="assetType.handlingNotice" class="detail__notice" role="note">
            {{ assetType.handlingNotice }}
          </p>
        </section>

        <div class="detail__side">
          <section class="detail__card" aria-labelledby="detail-reserve-heading">
            <h2 id="detail-reserve-heading" class="detail__card-heading">
              {{ sk.assetTypeDetail.reserveHeading }}
            </h2>
            <AvailabilityCalendar
              :month="calendar"
              :status="calendarStatus"
              :start-day="startDay"
              :end-day="endDay"
              @pick="pick"
              @navigate="loadMonth"
            />

            <div class="detail__quantity">
              <label :for="quantityId" class="detail__quantity-label">
                {{ sk.assetTypeDetail.quantityLabel }}
              </label>
              <QuantityStepper
                :id="quantityId"
                v-model="quantity"
                :decrease-label="sk.assetTypeDetail.quantityDecrease"
                :increase-label="sk.assetTypeDetail.quantityIncrease"
              />
            </div>

            <fieldset v-if="assetType.accessories.length > 0" class="detail__accessories">
              <legend class="detail__accessories-heading">
                {{ sk.assetTypeDetail.accessoriesHeading }}
              </legend>
              <label
                v-for="accessory in assetType.accessories"
                :key="accessory.id"
                class="detail__accessory"
                :class="{
                  'detail__accessory--chosen': chosenAccessoryIds.includes(accessory.id),
                  'detail__accessory--off': rangeStatus !== 'ok' || !accessoryFits[accessory.id],
                }"
              >
                <input
                  v-model="chosenAccessoryIds"
                  type="checkbox"
                  :value="accessory.id"
                  :disabled="rangeStatus !== 'ok' || !accessoryFits[accessory.id]"
                />
                <span
                  v-if="accessory.imageFile"
                  class="detail__accessory-thumb"
                  aria-hidden="true"
                >
                  <img :src="`/catalog/${accessory.imageFile}`" alt="" width="96" height="96" />
                </span>
                <span class="detail__accessory-text">
                  <span class="detail__accessory-name">{{ accessory.name }}</span>
                  <span class="detail__accessory-meta">
                    {{
                      sk.assetTypeDetail.accessoryPrice.replace(
                        '{amount}',
                        formatMoney(accessory.dayRate),
                      )
                    }}
                    ·
                    {{
                      sk.assetTypeDetail.depositInline.replace(
                        '{amount}',
                        formatMoney(accessory.depositAmount),
                      )
                    }}
                  </span>
                  <small v-if="rangeStatus !== 'ok'" class="detail__reason">
                    {{ sk.assetTypeDetail.accessoryPickPeriodFirst }}
                  </small>
                  <small v-else-if="!accessoryFits[accessory.id]" class="detail__reason">
                    {{ sk.assetTypeDetail.accessoryUnavailable }}
                  </small>
                </span>
              </label>
            </fieldset>
          </section>

          <!-- On a phone this bar floats at the bottom of the screen; it names
            the period and its sum, says what is still missing, and after adding
            offers the next step instead of the same button. -->
          <div class="detail__action" :class="{ 'detail__action--added': added }">
            <template v-if="added">
              <p class="detail__added" role="status">
                <span class="detail__added-mark" aria-hidden="true" />
                {{ sk.assetTypeDetail.addedTitle }}
              </p>
              <div class="detail__added-actions">
                <NuxtLink to="/checkout" class="detail__cta-link">
                  <AppButton class="detail__cta" variant="primary">
                    {{ sk.assetTypeDetail.continueAction }}
                  </AppButton>
                </NuxtLink>
                <AppButton variant="quiet" @click="pickAnother">
                  {{ sk.assetTypeDetail.pickAnotherAction }}
                </AppButton>
              </div>
            </template>

            <template v-else>
              <div class="detail__action-row">
                <div class="detail__summary">
                  <p v-if="hint" class="detail__hint">{{ hint }}</p>
                  <template v-else-if="startDay && endDay">
                    <span class="detail__summary-period">
                      <DayRange :start-day="startDay" :end-day="endDay" />
                      <template v-if="periodDays !== null">
                        · {{ formatCount(periodDays, sk.assetTypeDetail.dayCount) }}
                      </template>
                    </span>
                    <MoneyAmount
                      v-if="periodQuote"
                      class="detail__summary-total"
                      :amount="periodQuote.rentalFeeTotal"
                    />
                  </template>
                </div>
                <AppButton
                  class="detail__cta"
                  variant="primary"
                  :pending="rangeStatus === 'checking'"
                  :disabled="rangeStatus !== 'ok'"
                  @click="reserve"
                >
                  {{ sk.assetTypeDetail.addAction }}
                </AppButton>
              </div>
              <p v-if="rangeStatus === 'checking'" class="detail__hint" aria-busy="true">
                {{ sk.assetTypeDetail.rangeChecking }}
              </p>
              <AppAlert
                v-else-if="rangeStatus === 'unavailable'"
                variant="warn"
                :message="sk.assetTypeDetail.rangeUnavailable"
              />
              <AppAlert
                v-else-if="rangeStatus === 'error'"
                :message="sk.assetTypeDetail.rangeError"
              />
              <p v-else class="detail__note">{{ sk.assetTypeDetail.paymentNote }}</p>
            </template>
          </div>
        </div>

        <section
          v-if="assetType.specifications.length > 0 || assetType.includedContents"
          class="detail__info"
        >
          <details v-if="assetType.specifications.length > 0" class="detail__more" open>
            <summary>{{ sk.assetTypeDetail.specificationsHeading }}</summary>
            <dl class="detail__specs">
              <template v-for="spec in assetType.specifications" :key="spec.label">
                <dt>{{ spec.label }}</dt>
                <dd>{{ spec.value }}</dd>
              </template>
            </dl>
          </details>
          <details v-if="assetType.includedContents" class="detail__more">
            <summary>{{ sk.assetTypeDetail.includedHeading }}</summary>
            <p>{{ assetType.includedContents }}</p>
          </details>
          <NuxtLink to="/podmienky" class="detail__terms">{{
            sk.assetTypeDetail.termsLink
          }}</NuxtLink>
        </section>
      </div>
    </div>
  </main>
</template>

<style scoped>
.detail {
  width: 100%;
}

.detail__head {
  box-sizing: border-box;
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--ht-space-4) var(--ht-space-4) var(--ht-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-2);
}

.detail__back {
  align-self: flex-start;
  color: var(--ht-brand);
  font-weight: 600;
  font-size: var(--ht-text-2);
}

.detail__title {
  margin: 0;
  font-size: var(--ht-text-5);
  line-height: 1.15;
}

.detail__lead {
  margin: 0;
  max-width: 60ch;
  color: var(--ht-ink-muted);
  font-size: var(--ht-text-3);
}

.detail__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ht-space-2);
  margin-top: var(--ht-space-1);
}

.detail__chip {
  display: inline-flex;
  align-items: center;
  min-height: calc(var(--ht-space-6) + var(--ht-space-1));
  padding: 0 var(--ht-space-3);
  border: 1px solid var(--ht-line);
  border-radius: var(--ht-radius-tile);
  background: var(--ht-surface);
  color: var(--ht-ink);
  font-weight: 700;
  font-size: var(--ht-text-3);
}

.detail__chip--rate {
  border-color: var(--ht-brand-tint);
  background: var(--ht-brand-tint);
  color: var(--ht-brand-deep);
}

.detail__body {
  box-sizing: border-box;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--ht-space-4) var(--ht-space-5);
}

.detail__layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ht-space-4);
}

/* Phone: the wrapper dissolves and order places the details before the bar,
 * so the bar is the last thing on the page and floats at the bottom. */
.detail__side {
  display: contents;
}

.detail__intro {
  order: 1;
}

.detail__card {
  order: 2;
}

.detail__info {
  order: 3;
}

.detail__action {
  order: 4;
}

/* --- Photo and highlights --- */

.detail__intro {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-3);
}

.detail__image {
  aspect-ratio: 4 / 3;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--ht-space-5);
  background: var(--ht-surface);
  border-radius: var(--ht-radius-card);
  box-shadow: var(--ht-shadow-card);
}

.detail__image img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.detail__image--empty {
  aspect-ratio: 16 / 9;
  color: var(--ht-ink-muted);
}

.detail__highlights {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ht-space-2);
}

.detail__highlights li {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-1);
  padding: var(--ht-space-3) var(--ht-space-4);
  border-radius: var(--ht-radius-card);
  background: var(--ht-surface);
}

.detail__highlights strong {
  color: var(--ht-brand);
  font-size: var(--ht-text-4);
  line-height: 1.2;
}

.detail__highlights span {
  font-size: var(--ht-text-2);
  color: var(--ht-ink-muted);
}

.detail__notice {
  margin: 0;
  padding: var(--ht-space-3) var(--ht-space-4);
  border-radius: var(--ht-radius-card);
  border: 2px solid var(--ht-danger);
  background: var(--ht-surface);
  color: var(--ht-danger);
  font-weight: 600;
}

/* --- Reservation card --- */

.detail__card {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-4);
  padding: var(--ht-space-5) var(--ht-space-4);
  background: var(--ht-surface);
  border-radius: var(--ht-radius-card);
  box-shadow: var(--ht-shadow-card);
}

.detail__card-heading {
  margin: 0;
  font-size: var(--ht-text-4);
}

.detail__quantity {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ht-space-3);
  padding: var(--ht-space-2) var(--ht-space-2) var(--ht-space-2) var(--ht-space-4);
  border-radius: var(--ht-radius-card);
  background: var(--ht-paper);
}

.detail__quantity-label {
  font-weight: 600;
}

.detail__accessories {
  margin: 0;
  padding: 0;
  border: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-2);
}

.detail__accessories-heading {
  margin-bottom: var(--ht-space-2);
  padding: 0;
  font-weight: 600;
}

.detail__accessory {
  display: flex;
  align-items: center;
  gap: var(--ht-space-3);
  min-height: var(--ht-hit-min);
  padding: var(--ht-space-3);
  border: 2px solid var(--ht-line);
  border-radius: var(--ht-radius-card);
  cursor: pointer;
  transition:
    background-color var(--ht-motion),
    border-color var(--ht-motion);
}

.detail__accessory input {
  flex: none;
  width: var(--ht-space-5);
  height: var(--ht-space-5);
  margin: 0;
  accent-color: var(--ht-brand);
}

.detail__accessory--chosen {
  border-color: var(--ht-brand-light);
  background: var(--ht-brand-tint);
}

.detail__accessory--off {
  cursor: default;
}

.detail__accessory-thumb {
  flex: none;
  width: var(--ht-space-7);
  height: var(--ht-space-7);
  border-radius: var(--ht-radius-plate);
  background: var(--ht-surface);
  overflow: hidden;
}

.detail__accessory-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.detail__accessory-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.detail__accessory-name {
  font-weight: 600;
}

.detail__accessory-meta,
.detail__reason {
  font-size: var(--ht-text-2);
  color: var(--ht-ink-muted);
}

/* --- Details --- */

.detail__info {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-2);
  padding: var(--ht-space-2) var(--ht-space-4) var(--ht-space-4);
  border-radius: var(--ht-radius-card);
  background: var(--ht-surface);
}

.detail__more + .detail__more {
  border-top: 1px solid var(--ht-line);
}

.detail__more summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: calc(var(--ht-hit-min) + var(--ht-space-2));
  font-weight: 600;
  font-size: var(--ht-text-4);
  cursor: pointer;
  list-style: none;
}

.detail__more summary::-webkit-details-marker {
  display: none;
}

/* A drawn chevron: down when closed, up when open. */
.detail__more summary::after {
  content: '';
  width: var(--ht-space-2);
  height: var(--ht-space-2);
  margin-right: var(--ht-space-2);
  border: solid var(--ht-ink-muted);
  border-width: 0 calc(var(--ht-space-1) / 2) calc(var(--ht-space-1) / 2) 0;
  transform: rotate(45deg);
  transition: transform var(--ht-motion);
}

.detail__more[open] summary::after {
  transform: rotate(-135deg);
}

.detail__more > p,
.detail__specs {
  margin: 0 0 var(--ht-space-4);
}

.detail__specs {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--ht-space-2) var(--ht-space-4);
}

.detail__specs dt {
  color: var(--ht-ink-muted);
}

.detail__specs dd {
  margin: 0;
  font-weight: 600;
}

.detail__terms {
  align-self: flex-start;
  color: var(--ht-brand);
  font-weight: 600;
}

/* --- Action bar: a floating card --- */

.detail__action {
  position: sticky;
  bottom: calc(var(--ht-space-3) + var(--ht-safe-bottom));
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-2);
  padding: var(--ht-space-3) var(--ht-space-4);
  background: var(--ht-surface);
  border-radius: var(--ht-radius-card);
  box-shadow: var(--ht-shadow-raised);
}

.detail__action p {
  margin: 0;
}

/* The period and its sum on one line, the button full width under them. */
.detail__action-row {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--ht-space-2);
}

.detail__summary {
  min-width: 0;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ht-space-3);
}

.detail__summary-period {
  font-size: var(--ht-text-2);
  color: var(--ht-ink-muted);
}

.detail__summary-total {
  color: var(--ht-brand-deep);
  font-size: var(--ht-text-5);
  line-height: 1.1;
}

.detail__hint,
.detail__note {
  color: var(--ht-ink-muted);
  font-size: var(--ht-text-2);
}

.detail__cta {
  width: 100%;
  height: calc(var(--ht-hit-min) + var(--ht-space-2));
  padding: 0 var(--ht-space-5);
  font-size: var(--ht-text-3);
}

.detail__added {
  display: flex;
  align-items: center;
  gap: var(--ht-space-2);
  color: var(--ht-ok);
  font-weight: 600;
}

/* The next step full width, the way back under it. */
.detail__added-actions {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--ht-space-1);
}

.detail__added-actions .detail__cta {
  width: 100%;
}

/* A drawn check mark in a circle, no icon font. */
.detail__added-mark {
  position: relative;
  flex: none;
  width: var(--ht-space-5);
  height: var(--ht-space-5);
  border-radius: 50%;
  background: var(--ht-ok);
}

.detail__added-mark::after {
  content: '';
  position: absolute;
  left: 34%;
  top: 22%;
  width: 25%;
  height: 45%;
  border: solid var(--ht-on-brand);
  border-width: 0 calc(var(--ht-space-1) / 2) calc(var(--ht-space-1) / 2) 0;
  transform: rotate(45deg);
}

@media (min-width: 900px) {
  .detail__title {
    font-size: var(--ht-text-6);
  }

  .detail__body {
    padding-bottom: var(--ht-space-7);
  }

  .detail__layout {
    grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
    column-gap: var(--ht-space-6);
    row-gap: var(--ht-space-5);
    align-items: start;
  }

  .detail__intro {
    grid-column: 1;
    grid-row: 1;
  }

  .detail__info {
    grid-column: 1;
    grid-row: 2;
  }

  .detail__side {
    grid-column: 2;
    grid-row: 1 / span 2;
    display: flex;
    flex-direction: column;
    gap: var(--ht-space-3);
    position: sticky;
    top: var(--ht-space-4);
  }

  .detail__highlights {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .detail__card {
    padding: var(--ht-space-5);
  }

  .detail__action {
    position: static;
    padding: var(--ht-space-4) var(--ht-space-5);
    box-shadow: var(--ht-shadow-card);
  }

}
</style>
