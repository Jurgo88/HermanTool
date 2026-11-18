<script setup lang="ts">
// S-27 Nastavenia (D-65; issue #215): the Tenant's policy values. First
// one: the discount for paying the rental fee online. It is empty — no
// discount — until the owner sets it (OQ #31); nothing here suggests a
// value. Entered as a percentage, sent in basis points like prices are
// entered in euros and sent in cents (S-19).
import { sk } from '~/i18n/sk'
import { formatDateTime, formatPercent } from '~/utils/format'
import { getErrorCode } from '~/utils/error-code'

definePageMeta({ layout: 'admin' })

interface SettingsView {
  onlinePaymentDiscountBasisPoints: number | null
  updatedAt: string | null
}

const nuxtApp = useNuxtApp()
const requestFetch = useRequestFetch()

const settings = ref<SettingsView | null>(null)
// #216: a count only.
const marketingCount = ref<number | null>(null)
const loadError = ref(false)
const percent = ref('')
const saveState = ref<'idle' | 'pending' | 'saved' | 'error'>('idle')
const saveError = ref<string | null>(null)

async function load() {
  loadError.value = false
  try {
    const [loaded, consents] = await Promise.all([
      requestFetch<SettingsView>('/api/admin/settings'),
      requestFetch<{ count: number }>('/api/admin/marketing-consents/count'),
    ])
    settings.value = loaded
    marketingCount.value = consents.count
    const bp = settings.value.onlinePaymentDiscountBasisPoints
    percent.value = bp === null ? '' : String(bp / 100)
  } catch (err) {
    if ((err as { statusCode?: number })?.statusCode === 401) {
      await nuxtApp.runWithContext(() => navigateTo('/login?redirect=/admin/settings'))
      return
    }
    loadError.value = true
  }
}

await load()

const percentValid = computed(() => {
  if (percent.value.trim() === '') return true
  const value = Number(percent.value.replace(',', '.'))
  return (
    Number.isFinite(value) && value > 0 && value < 100 && Number.isInteger(Math.round(value * 100))
  )
})

async function save(clear = false) {
  if (!clear && !percentValid.value) return
  saveState.value = 'pending'
  saveError.value = null
  const raw = percent.value.trim()
  const basisPoints = clear || raw === '' ? null : Math.round(Number(raw.replace(',', '.')) * 100)
  try {
    settings.value = await $fetch<SettingsView>('/api/admin/settings/online-payment-discount', {
      method: 'PUT',
      body: { basisPoints },
    })
    if (clear) percent.value = ''
    saveState.value = 'saved'
  } catch (err) {
    const code = getErrorCode(err)
    saveError.value =
      (code ? (sk.errors.operator as Record<string, string>)[code] : undefined) ??
      sk.common.somethingWentWrong
    saveState.value = 'error'
  }
}
</script>

<template>
  <main class="settings">
    <h1 class="settings__title">{{ sk.adminSettings.title }}</h1>
    <AppAlert v-if="loadError" :message="sk.adminSettings.loadError" />

    <section v-if="settings" class="settings__card" aria-labelledby="settings-discount-heading">
      <h2 id="settings-discount-heading">{{ sk.adminSettings.discountHeading }}</h2>
      <p class="settings__note">{{ sk.adminSettings.discountIntro }}</p>
      <p class="settings__current" role="status">
        {{
          settings.onlinePaymentDiscountBasisPoints === null
            ? sk.adminSettings.discountOff
            : sk.adminSettings.discountOn.replace(
                '{percent}',
                formatPercent(settings.onlinePaymentDiscountBasisPoints / 10000),
              )
        }}
        <template v-if="settings.updatedAt">
          · {{ sk.adminSettings.updatedAt.replace('{time}', formatDateTime(settings.updatedAt)) }}
        </template>
      </p>
      <form class="settings__form" @submit.prevent="save()">
        <AppField
          :label="sk.adminSettings.discountLabel"
          :hint="sk.adminSettings.discountHint"
          :error="percentValid ? null : sk.adminSettings.discountInvalid"
        >
          <template #default="slotProps">
            <input
              :id="slotProps.id"
              v-model="percent"
              type="text"
              inputmode="decimal"
              :aria-describedby="slotProps.ariaDescribedby"
            />
          </template>
        </AppField>
        <div class="settings__actions">
          <AppButton type="submit" :pending="saveState === 'pending'" :disabled="!percentValid">
            {{ sk.adminSettings.saveAction }}
          </AppButton>
          <AppButton
            v-if="settings.onlinePaymentDiscountBasisPoints !== null"
            variant="quiet"
            :disabled="saveState === 'pending'"
            @click="save(true)"
          >
            {{ sk.adminSettings.clearAction }}
          </AppButton>
        </div>
        <p v-if="saveState === 'saved'" class="settings__saved" role="status">
          {{ sk.adminSettings.saved }}
        </p>
        <AppAlert v-if="saveState === 'error'" :message="saveError" />
      </form>
    </section>

    <section
      v-if="marketingCount !== null"
      class="settings__card"
      aria-labelledby="settings-marketing-heading"
    >
      <h2 id="settings-marketing-heading">{{ sk.adminSettings.marketingHeading }}</h2>
      <p class="settings__current">
        {{ sk.adminSettings.marketingCount.replace('{count}', String(marketingCount)) }}
      </p>
      <p class="settings__note">{{ sk.adminSettings.marketingNote }}</p>
    </section>
  </main>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-4);
  padding: var(--ht-space-5) var(--ht-space-4);
  max-width: 48rem;
}

.settings__title {
  margin: 0;
  font-size: var(--ht-text-5);
}

.settings__card {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-3);
  padding: var(--ht-space-4);
  background: var(--ht-surface);
  border: var(--ht-line-width) solid var(--ht-line);
  border-radius: var(--ht-radius-card);
}

.settings__card h2 {
  margin: 0;
  font-size: var(--ht-text-4);
}

.settings__note {
  margin: 0;
  color: var(--ht-ink-muted);
}

.settings__current {
  margin: 0;
  font-weight: 600;
}

.settings__form {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ht-space-3);
}

.settings__actions {
  display: flex;
  gap: var(--ht-space-2);
}

.settings__saved {
  margin: 0;
  color: var(--ht-ok);
}
</style>
