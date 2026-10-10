<script setup lang="ts">
// S-18, D-22, A-09: low-frequency admin surface, distinct from the
// high-frequency counter interaction. Restyle only — behaviour
// unchanged. Posts to /api/auth/login, which sets an httpOnly session
// cookie — this page never handles a Supabase token directly (D-25,
// D-31: no client-side supabase-js).
import { sk } from '~/i18n/sk'
import { safeOperatorRedirect } from '~/utils/operator-redirect'

definePageMeta({ layout: 'auth' })

const email = ref('')
const password = ref('')
const error = ref<string | null>(null)
const submitting = ref(false)

// Back to the page the Operator was on when the session ended, otherwise the
// counter (S-08). The target is untrusted (address bar), so only a path inside
// /admin is honoured.
const route = useRoute()
const target = safeOperatorRedirect(route.query.redirect)
const returning = typeof route.query.redirect === 'string' && target === route.query.redirect

// Already signed in: there is nothing to ask. An expired or missing session
// answers 401, which just leaves the form on screen.
const signedIn = await useRequestFetch()('/api/operators/me').then(
  () => true,
  () => false,
)
if (signedIn) await navigateTo(target, { replace: true })

async function submit() {
  error.value = null
  submitting.value = true
  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: { email: email.value, password: password.value },
    })
    await navigateTo(target)
  } catch {
    error.value = sk.login.invalidCredentials
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="login">
    <h1>{{ sk.login.title }}</h1>
    <AppAlert v-if="returning" variant="info" :message="sk.login.returnNotice" />
    <form @submit.prevent="submit">
      <AppField :label="sk.login.email">
        <template #default="slotProps">
          <input :id="slotProps.id" v-model="email" type="email" autocomplete="username" required />
        </template>
      </AppField>
      <AppField :label="sk.login.password">
        <template #default="slotProps">
          <input
            :id="slotProps.id"
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
          />
        </template>
      </AppField>
      <AppButton type="submit" variant="primary" :pending="submitting">{{
        sk.login.submit
      }}</AppButton>
    </form>
    <AppAlert :message="error" />
    <NuxtLink to="/" class="login__back">{{ sk.login.backToCatalog }}</NuxtLink>
  </main>
</template>

<style scoped>
.login__back {
  align-self: flex-start;
  color: var(--ht-ink-muted);
}

.login {
  max-width: 360px;
  margin: var(--ht-space-7) auto;
  padding: var(--ht-space-5);
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-4);
}
</style>
