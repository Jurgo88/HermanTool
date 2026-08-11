<!-- C-03 (D-43, D-50; docs/design/interface-design-foundation.md §3 UI-D-08,
  §5). Takes an error CODE, never raw server text — the code is looked up
  in sk.ts's two registers (Operator: specific/actionable; Customer:
  plain, never technical), falling back to common.somethingWentWrong for
  a code with no translation yet. `message` is the escape hatch for
  already-Slovak, non-domain-error copy (client-side form validation,
  e.g. sk.checkout.missingCustomerDetailsError) — it is never raw English
  or a server statusMessage. -->
<script setup lang="ts">
import { sk } from '~/i18n/sk'

const props = withDefaults(
  defineProps<{
    variant?: 'error' | 'warn' | 'info' | 'ok'
    code?: string | null
    audience?: 'operator' | 'customer'
    message?: string | null
  }>(),
  { variant: 'error', code: null, audience: 'operator', message: null },
)

const resolvedMessage = computed(() => {
  if (props.message) return props.message
  if (props.code) {
    const register: Record<string, string> = props.audience === 'customer' ? sk.errors.customer : sk.errors.operator
    return register[props.code] ?? sk.common.somethingWentWrong
  }
  return null
})
</script>

<template>
  <p v-if="resolvedMessage" role="alert" :class="['app-alert', `app-alert--${variant}`]">{{ resolvedMessage }}</p>
</template>

<style scoped>
.app-alert {
  margin: 0;
  border-left: 4px solid var(--ht-danger);
  background: color-mix(in srgb, var(--ht-danger) 8%, transparent);
  padding: var(--ht-space-3);
  border-radius: var(--ht-radius-plate);
  font-size: var(--ht-text-2);
  color: var(--ht-ink);
}

.app-alert--warn {
  border-color: var(--ht-warn);
  background: color-mix(in srgb, var(--ht-warn) 8%, transparent);
}

.app-alert--info {
  border-color: var(--ht-info);
  background: color-mix(in srgb, var(--ht-info) 8%, transparent);
}

.app-alert--ok {
  border-color: var(--ht-ok);
  background: color-mix(in srgb, var(--ht-ok) 8%, transparent);
}
</style>
