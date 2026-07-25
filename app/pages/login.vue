<script setup lang="ts">
// Operator login (D-22, A-09: low-frequency admin surface, distinct from
// the high-frequency counter interaction). Posts to /api/auth/login,
// which sets an httpOnly session cookie — this page never handles a
// Supabase token directly (D-25, D-31: no client-side supabase-js).
const email = ref('')
const password = ref('')
const error = ref<string | null>(null)
const submitting = ref(false)

async function submit() {
  error.value = null
  submitting.value = true
  try {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: { email: email.value, password: password.value },
    })
  } catch {
    error.value = 'Email or password is incorrect.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main>
    <h1>Operator login</h1>
    <form @submit.prevent="submit">
      <label>
        Email
        <input v-model="email" type="email" autocomplete="username" required />
      </label>
      <label>
        Password
        <input v-model="password" type="password" autocomplete="current-password" required />
      </label>
      <button type="submit" :disabled="submitting">Log in</button>
    </form>
    <p v-if="error" role="alert">{{ error }}</p>
  </main>
</template>
