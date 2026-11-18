<script setup lang="ts">
// S-29 Dovoz a odvoz (D-66, FR-34, D-48; issue #217). The DeliveryZone,
// the fee settings (empty until the owner sets them — OQ #32), and the
// list of upcoming Deliveries and Collections per day. Outside-zone legs
// are priced here after the phone call (km only; the server computes the
// fee) and their fee attested when the driver is paid — both PIN-gated.
// Days, fees and totals all come from the server.
import { sk } from '~/i18n/sk'
import { formatDay, formatMoney, type MonetaryAmountView } from '~/utils/format'
import { getErrorCode } from '~/utils/error-code'
import { phoneHref } from '~/utils/phone'

definePageMeta({ layout: 'admin' })

interface ZoneView {
  municipalities: { id: number; name: string }[]
  flatFee: MonetaryAmountView | null
  perKmRate: MonetaryAmountView | null
}

interface LegView {
  deliveryId: number
  reservationGroupId: number
  leg: 'delivery' | 'collection'
  day: string
  timeWindow: 'morning' | 'afternoon'
  outsideZone: boolean
  municipality: string | null
  address: string
  fee: MonetaryAmountView | null
  distanceKm: number | null
  feeAttested: boolean
  customerName: string | null
  customerPhone: string | null
}

const nuxtApp = useNuxtApp()
const requestFetch = useRequestFetch()

const zone = ref<ZoneView | null>(null)
const legs = ref<LegView[]>([])
const loadError = ref(false)
const actionError = ref<string | null>(null)

const toEuros = (money: MonetaryAmountView | null) => (money ? (money.amount / 100).toFixed(2) : '')
const toCents = (euros: string) =>
  euros.trim() === '' ? null : Math.round(Number(euros.replace(',', '.')) * 100)

const flatFeeEuros = ref('')
const perKmEuros = ref('')
const newMunicipality = ref('')

async function load() {
  loadError.value = false
  try {
    const [loadedZone, schedule] = await Promise.all([
      requestFetch<ZoneView>('/api/admin/delivery/zone'),
      requestFetch<{ legs: LegView[] }>('/api/admin/delivery/schedule'),
    ])
    zone.value = loadedZone
    legs.value = schedule.legs
    flatFeeEuros.value = toEuros(loadedZone.flatFee)
    perKmEuros.value = toEuros(loadedZone.perKmRate)
  } catch (err) {
    if ((err as { statusCode?: number })?.statusCode === 401) {
      await nuxtApp.runWithContext(() => navigateTo('/login?redirect=/admin/delivery'))
      return
    }
    loadError.value = true
  }
}

await load()

function errorText(err: unknown): string {
  const code = getErrorCode(err)
  return (
    (code ? (sk.errors.operator as Record<string, string>)[code] : undefined) ??
    sk.common.somethingWentWrong
  )
}

const pending = ref<string | null>(null)

async function run(key: string, action: () => Promise<unknown>) {
  pending.value = key
  actionError.value = null
  try {
    await action()
    await load()
  } catch (err) {
    actionError.value = errorText(err)
  } finally {
    pending.value = null
  }
}

const feesValid = computed(() =>
  [flatFeeEuros.value, perKmEuros.value].every((v) => {
    if (v.trim() === '') return true
    const n = Number(v.replace(',', '.'))
    return Number.isFinite(n) && n >= 0 && Number.isInteger(Math.round(n * 100))
  }),
)

const saveFees = () =>
  run('fees', () =>
    $fetch<unknown, string>('/api/admin/delivery/fees', {
      method: 'PUT',
      body: { flatFeeCents: toCents(flatFeeEuros.value), perKmCents: toCents(perKmEuros.value) },
    }),
  )

const addMunicipality = () =>
  run('add', async () => {
    await $fetch<unknown, string>('/api/admin/delivery/zone', {
      method: 'POST',
      body: { name: newMunicipality.value },
    })
    newMunicipality.value = ''
  })

const removeMunicipality = (id: number) =>
  run(`remove-${id}`, () =>
    $fetch<unknown, string>(`/api/admin/delivery/zone/${id}`, { method: 'DELETE' }),
  )

// Outside-zone pricing and fee attestation share one PIN prompt.
const kmInput = ref<Record<number, string>>({})
const methodInput = ref<Record<number, 'cash' | 'card_terminal' | 'qr'>>({})
const pinFor = ref<{ kind: 'price' | 'fee'; deliveryId: number } | null>(null)

async function confirmPin(pin: string) {
  const target = pinFor.value
  if (!target) return
  await run(`${target.kind}-${target.deliveryId}`, () =>
    target.kind === 'price'
      ? $fetch<unknown, string>(`/api/admin/delivery/${target.deliveryId}/price`, {
          method: 'POST',
          body: { distanceKm: Number(kmInput.value[target.deliveryId] ?? ''), pin },
        })
      : $fetch<unknown, string>(`/api/admin/delivery/${target.deliveryId}/fee-payment`, {
          method: 'POST',
          body: { method: methodInput.value[target.deliveryId] ?? 'cash', pin },
        }),
  )
  pinFor.value = null
}

const kmValid = (id: number) => /^\d{1,4}$/.test(kmInput.value[id] ?? '')
</script>

<template>
  <main class="delivery-admin">
    <h1 class="delivery-admin__title">{{ sk.adminDelivery.title }}</h1>
    <AppAlert v-if="loadError" :message="sk.adminDelivery.loadError" />
    <AppAlert :message="actionError" />

    <section v-if="zone" class="delivery-admin__card" aria-labelledby="delivery-fees-heading">
      <h2 id="delivery-fees-heading">{{ sk.adminDelivery.feesHeading }}</h2>
      <p class="delivery-admin__note">
        {{ zone.flatFee ? sk.adminDelivery.offeredNote : sk.adminDelivery.notOfferedNote }}
      </p>
      <form class="delivery-admin__row" @submit.prevent="saveFees">
        <AppField :label="sk.adminDelivery.flatFeeLabel">
          <template #default="slotProps">
            <input :id="slotProps.id" v-model="flatFeeEuros" type="text" inputmode="decimal" />
          </template>
        </AppField>
        <AppField :label="sk.adminDelivery.perKmLabel">
          <template #default="slotProps">
            <input :id="slotProps.id" v-model="perKmEuros" type="text" inputmode="decimal" />
          </template>
        </AppField>
        <AppButton type="submit" :pending="pending === 'fees'" :disabled="!feesValid">
          {{ sk.adminDelivery.saveAction }}
        </AppButton>
      </form>
    </section>

    <section v-if="zone" class="delivery-admin__card" aria-labelledby="delivery-zone-heading">
      <h2 id="delivery-zone-heading">{{ sk.adminDelivery.zoneHeading }}</h2>
      <p v-if="zone.municipalities.length === 0" class="delivery-admin__note">
        {{ sk.adminDelivery.zoneEmpty }}
      </p>
      <ul v-else class="delivery-admin__list">
        <li v-for="m in zone.municipalities" :key="m.id" class="delivery-admin__row">
          <span>{{ m.name }}</span>
          <AppButton
            variant="quiet"
            :pending="pending === `remove-${m.id}`"
            @click="removeMunicipality(m.id)"
          >
            {{ sk.adminDelivery.removeAction }}
          </AppButton>
        </li>
      </ul>
      <form class="delivery-admin__row" @submit.prevent="addMunicipality">
        <AppField :label="sk.adminDelivery.municipalityLabel">
          <template #default="slotProps">
            <input :id="slotProps.id" v-model="newMunicipality" type="text" maxlength="120" />
          </template>
        </AppField>
        <AppButton type="submit" :pending="pending === 'add'" :disabled="!newMunicipality.trim()">
          {{ sk.adminDelivery.addAction }}
        </AppButton>
      </form>
    </section>

    <section class="delivery-admin__card" aria-labelledby="delivery-schedule-heading">
      <h2 id="delivery-schedule-heading">{{ sk.adminDelivery.scheduleHeading }}</h2>
      <p v-if="legs.length === 0" class="delivery-admin__note">
        {{ sk.adminDelivery.scheduleEmpty }}
      </p>
      <ul v-else class="delivery-admin__list">
        <li v-for="leg in legs" :key="leg.deliveryId" class="delivery-admin__leg">
          <p class="delivery-admin__leg-head">
            <strong>{{ formatDay(leg.day) }}</strong>
            · {{ sk.adminDelivery.windows[leg.timeWindow] }} · {{ sk.adminDelivery.legs[leg.leg] }}
          </p>
          <p>
            {{ leg.address }}<template v-if="leg.municipality">, {{ leg.municipality }}</template>
          </p>
          <p v-if="leg.customerName">
            {{ leg.customerName }}
            <a v-if="leg.customerPhone" :href="phoneHref(leg.customerPhone)">{{
              leg.customerPhone
            }}</a>
          </p>
          <p v-if="!leg.outsideZone && leg.fee" class="delivery-admin__note">
            {{ sk.adminDelivery.inZoneFee.replace('{amount}', formatMoney(leg.fee)) }}
          </p>

          <template v-if="leg.outsideZone">
            <p class="delivery-admin__note">
              {{
                leg.fee
                  ? sk.adminDelivery.outsidePriced
                      .replace('{km}', String(leg.distanceKm))
                      .replace('{amount}', formatMoney(leg.fee))
                  : sk.adminDelivery.outsideUnpriced
              }}
            </p>
            <p v-if="leg.feeAttested" class="delivery-admin__done">
              {{ sk.adminDelivery.feeAttested }}
            </p>
            <template v-else>
              <form
                class="delivery-admin__row"
                @submit.prevent="pinFor = { kind: 'price', deliveryId: leg.deliveryId }"
              >
                <AppField :label="sk.adminDelivery.kmLabel">
                  <template #default="slotProps">
                    <input
                      :id="slotProps.id"
                      v-model="kmInput[leg.deliveryId]"
                      type="text"
                      inputmode="numeric"
                    />
                  </template>
                </AppField>
                <AppButton
                  type="submit"
                  variant="secondary"
                  :disabled="!kmValid(leg.deliveryId)"
                  :pending="pending === `price-${leg.deliveryId}`"
                >
                  {{ sk.adminDelivery.priceAction }}
                </AppButton>
              </form>
              <form
                v-if="leg.fee"
                class="delivery-admin__row"
                @submit.prevent="pinFor = { kind: 'fee', deliveryId: leg.deliveryId }"
              >
                <AppField :label="sk.adminDelivery.methodLabel">
                  <template #default="slotProps">
                    <select :id="slotProps.id" v-model="methodInput[leg.deliveryId]">
                      <option value="cash">{{ sk.onSitePayment.methods.cash }}</option>
                      <option value="card_terminal">
                        {{ sk.onSitePayment.methods.card_terminal }}
                      </option>
                      <option value="qr">{{ sk.onSitePayment.methods.qr }}</option>
                    </select>
                  </template>
                </AppField>
                <AppButton type="submit" :pending="pending === `fee-${leg.deliveryId}`">
                  {{ sk.adminDelivery.attestFeeAction.replace('{amount}', formatMoney(leg.fee)) }}
                </AppButton>
              </form>
            </template>
          </template>
        </li>
      </ul>
      <p class="delivery-admin__note">{{ sk.adminDelivery.handoverNote }}</p>
    </section>

    <PinPrompt
      :open="pinFor !== null"
      :pending="pending !== null"
      @confirm="confirmPin"
      @close="pinFor = null"
    />
  </main>
</template>

<style scoped>
.delivery-admin {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-4);
  padding: var(--ht-space-5) var(--ht-space-4);
}

.delivery-admin__title {
  margin: 0;
  font-size: var(--ht-text-5);
}

.delivery-admin__card {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-3);
  padding: var(--ht-space-4);
  background: var(--ht-surface);
  border: var(--ht-line-width) solid var(--ht-line);
  border-radius: var(--ht-radius-card);
}

.delivery-admin__card h2 {
  margin: 0;
  font-size: var(--ht-text-4);
}

.delivery-admin__note {
  margin: 0;
  color: var(--ht-ink-muted);
  font-size: var(--ht-text-2);
}

.delivery-admin__row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--ht-space-3);
}

.delivery-admin__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-3);
}

.delivery-admin__leg {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-1);
  padding-top: var(--ht-space-3);
  border-top: var(--ht-line-width) solid var(--ht-line);
}

.delivery-admin__leg p {
  margin: 0;
}

.delivery-admin__done {
  color: var(--ht-ok);
  font-weight: 600;
}
</style>
