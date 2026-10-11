<!-- D-43; docs/design/interface-design-foundation.md §2, §4.3, §6. The
  counter surface: dark, large-target, single-task (P3, NFR-02). Sets
  data-surface="counter" so tokens.css's dark-palette and wider
  type-scale overrides apply — the whole reason this is its own layout
  and not admin.vue with a class. The task-stack shell (C-17, S-08 —
  WP-2.2) still owns the actual chrome; this layout is the surface root
  it renders inside. theme-color (WP-6.1, §9) matches this surface's own
  dark --ht-paper, not the light default the other two layouts set. -->
<script setup lang="ts">
// The Operator's installable application (NFR-12). This is the surface the
// counter phone installs, and the only one whose chrome is dark.
usePwaHead('operator')
</script>

<template>
  <div data-surface="counter" class="counter-surface">
    <slot />
  </div>
</template>

<style scoped>
.counter-surface {
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--ht-paper);
  color: var(--ht-ink);
}

/* The four counter pages hold only their content, so the shell is here:
 * edge padding (and the home indicator's), one readable column, and a rhythm
 * between blocks. Before this the text touched the edges of the screen. */
.counter-surface :deep(main) {
  box-sizing: border-box;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: var(--ht-space-4) var(--ht-space-4) calc(var(--ht-space-6) + var(--ht-safe-bottom));
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-5);
}

.counter-surface :deep(main section) {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-3);
}

.counter-surface :deep(main > section) {
  gap: var(--ht-space-5);
}

/* A link that is a full-size touch target, shared by the counter pages. */
.counter-surface :deep(.counter-link) {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: var(--ht-hit-counter);
  padding: var(--ht-space-2) var(--ht-space-3);
  background: var(--ht-surface);
  color: var(--ht-ink);
  border: 1px solid var(--ht-ink-muted);
  border-radius: var(--ht-radius-card);
  font-family: var(--ht-font-condensed);
  font-weight: 600;
  text-align: center;
  text-decoration: none;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* Actions under a worklist row: stacked with room between them, so the
 * destructive one is never a thumb-width from a link. */
.counter-surface :deep(.counter-actions) {
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-3);
}

/* The step bar stays edge to edge inside the padded column. */
.counter-surface :deep(.step-header) {
  margin: calc(-1 * var(--ht-space-4)) calc(-1 * var(--ht-space-4)) 0;
}
</style>
