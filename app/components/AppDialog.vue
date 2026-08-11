<!-- C-04 (D-43; docs/design/interface-design-foundation.md §5, §8). Base
  for PinPrompt (C-11) and ConfirmAction (C-19). Built on the native
  <dialog> element deliberately, not a hand-rolled overlay: showModal()
  already gives a correct focus trap, Esc-to-close (fires 'cancel' then
  'close'), and focus restored to whatever was focused before opening —
  exactly "focus trap, Esc, restore focus" for free, and more reliably
  than reimplementing it. -->
<script setup lang="ts">
const props = defineProps<{ open: boolean; titleText: string }>()
const emit = defineEmits<{ close: [] }>()

const dialogRef = ref<HTMLDialogElement | null>(null)

watch(
  () => props.open,
  (isOpen) => {
    const el = dialogRef.value
    if (!el) return
    if (isOpen && !el.open) el.showModal()
    if (!isOpen && el.open) el.close()
  },
)

onMounted(() => {
  if (props.open) dialogRef.value?.showModal()
})

// Fires for both an Esc-driven cancel and a programmatic close() —
// either way the caller's `open` state needs to follow.
function onNativeClose() {
  emit('close')
}
</script>

<template>
  <dialog ref="dialogRef" class="app-dialog" :aria-label="titleText" @close="onNativeClose" @cancel="onNativeClose">
    <slot />
  </dialog>
</template>

<style scoped>
.app-dialog {
  border: 1px solid var(--ht-line-strong);
  border-radius: var(--ht-radius-card);
  padding: var(--ht-space-4);
  background: var(--ht-surface);
  color: var(--ht-ink);
  max-width: min(420px, calc(100vw - var(--ht-space-6)));
}

.app-dialog::backdrop {
  background: rgb(0 0 0 / 55%);
}
</style>
