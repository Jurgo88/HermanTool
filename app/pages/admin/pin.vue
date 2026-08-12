<script setup lang="ts">
// S-22, F8, FR-36; issue for WP-5.2. Server route already existed
// (POST /api/operators/pin) — this is its first UI. Self-service only
// (D-22): an Operator sets their OWN PIN, never another's; there is no
// admin surface to look one up or reset it for someone else.
import { sk } from '~/i18n/sk'
import { getErrorCode } from '~/utils/error-code'

definePageMeta({ layout: 'admin' })

const pin = ref('')
const confirmPin = ref('')
const errorCode = ref<string | null>(null)
const errorMessage = ref<string | null>(null)
const success = ref(false)
const submitting = ref(false)

const nuxtApp = useNuxtApp()

async function submit() {
  errorCode.value = null
  errorMessage.value = null
  success.value = false

  if (pin.value !== confirmPin.value) {
    errorMessage.value = sk.adminPin.mismatchError
    return
  }

  submitting.value = true
  try {
    await $fetch('/api/operators/pin', { method: 'POST', body: { pin: pin.value } })
    success.value = true
    pin.value = ''
    confirmPin.value = ''
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode
    if (statusCode === 401) {
      await nuxtApp.runWithContext(() => navigateTo('/login'))
      return
    }
    errorCode.value = getErrorCode(err) ?? 'UNKNOWN'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="admin-pin">
    <h1>{{ sk.adminPin.title }}</h1>
    <p>{{ sk.adminPin.intro }}</p>
    <AppAlert :code="errorCode" :message="errorMessage" />
    <p v-if="success">{{ sk.adminPin.success }}</p>

    <form @submit.prevent="submit">
      <AppField :label="sk.adminPin.pinLabel">
        <template #default="slotProps">
          <input :id="slotProps.id" v-model="pin" type="password" inputmode="numeric" autocomplete="off" minlength="4" required />
        </template>
      </AppField>
      <AppField :label="sk.adminPin.confirmLabel">
        <template #default="slotProps">
          <input :id="slotProps.id" v-model="confirmPin" type="password" inputmode="numeric" autocomplete="off" minlength="4" required />
        </template>
      </AppField>
      <AppButton type="submit" variant="primary" :pending="submitting">
        {{ submitting ? sk.adminPin.submitting : sk.adminPin.submitAction }}
      </AppButton>
    </form>
  </main>
</template>

<style scoped>
.admin-pin {
  max-width: 420px;
  margin: 0 auto;
  padding: var(--ht-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-4);
}
</style>
