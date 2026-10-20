<!-- C-29 (D-43, S-19). A large editor dialog over the list on desktop and
  a full-screen editor on a phone. Built on native <dialog> like AppDialog
  (C-04): focus trap, Esc and focus restore come with it. -->
<script setup lang="ts">
import { sk } from '~/i18n/sk'

const props = withDefaults(
  defineProps<{ open: boolean; titleText: string; closeDisabled?: boolean }>(),
  { closeDisabled: false },
)
const emit = defineEmits<{ close: [] }>()

const dialogRef = ref<HTMLDialogElement | null>(null)

function requestClose(event?: Event) {
  event?.preventDefault()
  if (!props.closeDisabled) emit('close')
}

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
  <dialog ref="dialogRef" class="side-panel" :aria-label="titleText" @cancel="requestClose">
    <header class="side-panel__head">
      <div class="side-panel__heading">
        <span class="side-panel__eyebrow">{{ sk.sidePanel.editorLabel }}</span>
        <h2 class="side-panel__title">{{ titleText }}</h2>
      </div>
      <button
        type="button"
        class="side-panel__close"
        :aria-label="sk.sidePanel.closeLabel"
        :disabled="closeDisabled"
        @click="requestClose()"
      >
        <span aria-hidden="true">{{ sk.sidePanel.closeGlyph }}</span>
      </button>
    </header>
    <div class="side-panel__body">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="side-panel__footer">
      <slot name="footer" />
    </footer>
  </dialog>
</template>

<style scoped>
.side-panel {
  box-sizing: border-box;
  width: min(var(--ht-dialog-max-width), calc(100vw - var(--ht-space-6)));
  height: min(var(--ht-dialog-max-height), calc(100dvh - var(--ht-space-6)));
  max-width: 100%;
  max-height: 100%;
  margin: auto;
  padding: 0;
  border: 0;
  background: var(--ht-paper);
  color: var(--ht-ink);
  display: none;
  flex-direction: column;
  border-radius: var(--ht-radius-card);
  box-shadow: var(--ht-shadow-dialog);
}

.side-panel[open] {
  display: flex;
}

.side-panel::backdrop {
  background: var(--ht-dialog-backdrop);
}

.side-panel__head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ht-space-3);
  padding: calc(var(--ht-space-3) + var(--ht-safe-top))
    calc(var(--ht-space-5) + var(--ht-safe-right)) var(--ht-space-3)
    calc(var(--ht-space-5) + var(--ht-safe-left));
  background: var(--ht-surface);
  border-bottom: var(--ht-line-width) solid var(--ht-line);
  box-shadow: inset 0 var(--ht-space-1) 0 var(--ht-signal);
}

.side-panel__heading {
  min-width: 0;
}

.side-panel__eyebrow {
  color: var(--ht-ink-muted);
  font-family: var(--ht-font-condensed);
  font-size: var(--ht-text-1);
  font-weight: 600;
  letter-spacing: var(--ht-tracking-wide);
  text-transform: uppercase;
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

.side-panel__close:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.side-panel__body {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--ht-space-5) calc(var(--ht-space-5) + var(--ht-safe-right)) var(--ht-space-5)
    calc(var(--ht-space-5) + var(--ht-safe-left));
}

.side-panel__footer {
  flex: none;
  padding: var(--ht-space-3) calc(var(--ht-space-5) + var(--ht-safe-right))
    calc(var(--ht-space-3) + var(--ht-safe-bottom)) calc(var(--ht-space-5) + var(--ht-safe-left));
  border-top: var(--ht-line-width) solid var(--ht-line);
  background: var(--ht-surface);
}

.side-panel a:focus-visible,
.side-panel button:focus-visible {
  outline: var(--ht-focus-ring-width) solid var(--ht-signal-deep);
  outline-offset: var(--ht-focus-ring-offset);
}

@media (max-width: 719px) {
  .side-panel {
    width: 100vw;
    height: 100dvh;
    border-radius: 0;
  }

  .side-panel__head {
    padding-inline-start: calc(var(--ht-space-4) + var(--ht-safe-left));
    padding-inline-end: calc(var(--ht-space-4) + var(--ht-safe-right));
  }

  .side-panel__body {
    padding-inline-start: calc(var(--ht-space-4) + var(--ht-safe-left));
    padding-inline-end: calc(var(--ht-space-4) + var(--ht-safe-right));
  }

  .side-panel__footer {
    padding-inline-start: calc(var(--ht-space-4) + var(--ht-safe-left));
    padding-inline-end: calc(var(--ht-space-4) + var(--ht-safe-right));
  }
}
</style>
