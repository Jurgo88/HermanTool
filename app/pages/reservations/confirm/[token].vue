<script setup lang="ts">
// S-26 (D-65, D-28; issue #215): the Customer follows the e-mailed link of
// a ReservationGroup paid on site and confirms it with one button. Opening
// the page changes nothing — a mail scanner prefetching the link must not
// confirm anyone's reservation — only the POST does. The page shows what
// the server answered and nothing it did not confirm (§7.1).
import { sk } from '~/i18n/sk'
import { getErrorCode } from '~/utils/error-code'

definePageMeta({ layout: 'public', hero: true })

const route = useRoute()
const token = String(route.params.token ?? '')

const status = ref<'idle' | 'pending' | 'confirmed' | 'error'>('idle')
const error = ref<string | null>(null)

async function confirm() {
  status.value = 'pending'
  error.value = null
  try {
    await $fetch(`/api/public/on-site-confirmation/${encodeURIComponent(token)}`, {
      method: 'POST',
    })
    status.value = 'confirmed'
  } catch (err) {
    const code = getErrorCode(err)
    error.value =
      (code ? (sk.errors.customer as Record<string, string>)[code] : undefined) ??
      sk.common.somethingWentWrong
    status.value = 'error'
  }
}
</script>

<template>
  <main class="on-site-confirm">
    <PublicHero>
      <h1>
        {{
          status === 'confirmed'
            ? sk.onSiteConfirmation.confirmedTitle
            : sk.onSiteConfirmation.title
        }}
      </h1>
      <p v-if="status !== 'confirmed'">{{ sk.onSiteConfirmation.lead }}</p>
    </PublicHero>

    <section class="on-site-confirm__card">
      <template v-if="status === 'confirmed'">
        <p role="status">{{ sk.onSiteConfirmation.confirmedBody }}</p>
        <NuxtLink to="/">
          <AppButton variant="secondary">{{ sk.onSiteConfirmation.backToCatalogAction }}</AppButton>
        </NuxtLink>
      </template>
      <template v-else>
        <AppAlert :message="error" />
        <AppButton
          variant="primary"
          size="counter"
          :pending="status === 'pending'"
          @click="confirm"
        >
          {{
            status === 'pending'
              ? sk.onSiteConfirmation.confirming
              : sk.onSiteConfirmation.confirmAction
          }}
        </AppButton>
      </template>
    </section>
  </main>
</template>

<style scoped>
.on-site-confirm {
  width: 100%;
}

.on-site-confirm__card {
  box-sizing: border-box;
  max-width: 680px;
  margin: calc(var(--ht-hero-overlap) * -1) auto 0;
  padding: var(--ht-space-5) var(--ht-space-4);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ht-space-3);
  background: var(--ht-surface);
  border-radius: var(--ht-radius-card);
  box-shadow: var(--ht-shadow-card);
  position: relative;
}
</style>
