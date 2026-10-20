<!-- C-29 (D-43, S-19). A panel that slides in from the right on a wide
  screen and fills a phone's screen, for editing one thing without leaving
  the list behind it. Built on the native <dialog> like AppDialog (C-04):
  focus trap, Esc and focus restore come with it. -->
<script setup lang="ts">
import { sk } from '~/i18n/sk'

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
</script>

<template>
  <dialog
    ref="dialogRef"
    class="side-panel"
    :aria-label="titleText"
    @close="emit('close')"
    @cancel="emit('close')"
  >
    <header class="side-panel__head">
      <h2 class="side-panel__title">{{ titleText }}</h2>
      <button
        type="button"
        class="side-panel__close"
        :aria-label="sk.sidePanel.closeLabel"
        @click="emit('close')"
      >
        <span aria-hidden="true">{{ sk.sidePanel.closeGlyph }}</span>
      </button>
    </header>
    <div class="side-panel__body">
      <slot />
    </div>
  </dialog>
</template>

<style scoped>
.side-panel {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  height: 100dvh;
  max-height: 100dvh;
  margin: 0 0 0 auto;
  padding: 0;
  border: 0;
  background: var(--ht-paper);
  color: var(--ht-ink);
  display: none;
  flex-direction: column;
}

.side-panel[open] {
  display: flex;
}

.side-panel::backdrop {
  background: rgb(0 0 0 / 45%);
}

.side-panel__head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ht-space-3);
  padding: calc(var(--ht-space-2) + var(--ht-safe-top)) var(--ht-space-4) var(--ht-space-2);
  background: var(--ht-surface);
  border-bottom: 1px solid var(--ht-line);
}

.side-panel__title {
  margin: 0;
  font-size: var(--ht-text-4);
  overflow-wrap: anywhere;
}

.side-panel__close {
  flex: none;
  width: var(--ht-hit-min);
  height: var(--ht-hit-min);
  border: 0;
  border-radius: var(--ht-radius-card);
  background: transparent;
  color: var(--ht-ink-muted);
  font-size: var(--ht-text-5);
  line-height: 1;
  cursor: pointer;
}

.side-panel__close:hover {
  background: var(--ht-surface-sunk);
  color: var(--ht-ink);
}

.side-panel__body {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--ht-space-4) var(--ht-space-4) calc(var(--ht-space-6) + var(--ht-safe-bottom));
}

@media (min-width: 720px) {
  .side-panel {
    width: min(640px, 92vw);
    box-shadow: -8px 0 32px rgb(0 0 0 / 20%);
  }
}
</style>
