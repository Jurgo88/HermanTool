<!-- C-19 (D-43; docs/design/interface-design-foundation.md §5, §7 rule 3).
  Confirms an irreversible act — declare lost, unpublish, mark rentable
  in bulk. `reasonLabel` turns on a required reason field for acts that
  need one (FR-31's declare-lost reason); acts that don't (unpublish)
  simply omit it. Separate gate from PinPrompt (C-11): an act can need
  either, both, or neither. -->
<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    open: boolean
    titleText: string
    bodyText: string
    confirmLabel: string
    reasonLabel?: string | null
    pending?: boolean
  }>(),
  { reasonLabel: null, pending: false },
)
const emit = defineEmits<{ confirm: [reason: string | undefined]; close: [] }>()

const reason = ref('')

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) reason.value = ''
  },
)

function submit() {
  if (props.reasonLabel && !reason.value) return
  emit('confirm', props.reasonLabel ? reason.value : undefined)
}

function handleClose() {
  reason.value = ''
  emit('close')
}
</script>

<template>
  <AppDialog :open="open" :title-text="titleText" @close="handleClose">
    <form @submit.prevent="submit">
      <p>{{ bodyText }}</p>
      <AppField v-if="reasonLabel" :label="reasonLabel">
        <template #default="slotProps">
          <input :id="slotProps.id" v-model="reason" type="text" required :aria-describedby="slotProps.ariaDescribedby" />
        </template>
      </AppField>
      <AppButton type="submit" variant="danger" :pending="pending">{{ confirmLabel }}</AppButton>
    </form>
  </AppDialog>
</template>
