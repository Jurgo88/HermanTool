<!-- C-05 (D-43; docs/design/interface-design-foundation.md §5). Admin
  density, sticky header, zebra striping via --ht-surface-sunk. A thin
  styled wrapper around a real <table> (passed as the slot) rather than
  its own markup, so callers keep ordinary <thead>/<tbody> structure —
  this component owns only presentation. -->
<template>
  <div class="app-table-wrap">
    <table class="app-table">
      <slot />
    </table>
  </div>
</template>

<style scoped>
.app-table-wrap {
  overflow-x: auto;
}

.app-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--ht-text-2);
}

.app-table :deep(thead) {
  position: sticky;
  top: 0;
  background: var(--ht-surface);
}

.app-table :deep(th) {
  text-align: left;
  padding: var(--ht-space-2) var(--ht-space-3);
  border-bottom: 1px solid var(--ht-line-strong);
  font-family: var(--ht-font-condensed);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: var(--ht-text-1);
  color: var(--ht-ink-muted);
}

.app-table :deep(td) {
  padding: var(--ht-space-2) var(--ht-space-3);
  border-bottom: 1px solid var(--ht-line);
}

.app-table :deep(tbody tr:nth-child(even)) {
  background: var(--ht-surface-sunk);
}
</style>
