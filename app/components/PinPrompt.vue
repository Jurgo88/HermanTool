<!-- C-11 (D-48; docs/design/interface-design-foundation.md §3 UI-D-06).
  Per-attestation PIN modal — invoked by the submit action for
  DepositTaken, DepositReturned and ConditionReport (HandoverOut,
  HandoverIn, Settlement). Never prefilled, never remembered, cleared on
  close. -->
<script setup lang="ts">
import { sk } from '~/i18n/sk'

const props = withDefaults(defineProps<{ open: boolean; pending?: boolean; pendingLabel?: string | null }>(), {
  pending: false,
  pendingLabel: null,
})
const emit = defineEmits<{ confirm: [pin: string]; close: [] }>()

const pin = ref('')

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) pin.value = ''
  },
)

function submit() {
  if (!pin.value) return
  emit('confirm', pin.value)
}

function handleClose() {
  pin.value = ''
  emit('close')
}
</script>

<template>
  <AppDialog :open="open" :title-text="sk.adminCounter.pinLabel" @close="handleClose">
    <form @submit.prevent="submit">
      <AppField :label="sk.adminCounter.pinLabel">
        <template #default="slotProps">
          <input
            :id="slotProps.id"
            v-model="pin"
            type="password"
            inputmode="numeric"
            autocomplete="off"
            :aria-describedby="slotProps.ariaDescribedby"
          />
        </template>
      </AppField>
      <AppButton type="submit" size="counter" :pending="pending">
        {{ pending && pendingLabel ? pendingLabel : sk.adminCounter.pinConfirmAction }}
      </AppButton>
    </form>
  </AppDialog>
</template>
