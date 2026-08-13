<!-- D-43; docs/design/interface-design-foundation.md §2, §4.3, §6. The
  counter surface: dark, large-target, single-task (P3, NFR-02). Sets
  data-surface="counter" so tokens.css's dark-palette and wider
  type-scale overrides apply — the whole reason this is its own layout
  and not admin.vue with a class. The task-stack shell (C-17, S-08 —
  WP-2.2) still owns the actual chrome; this layout is the surface root
  it renders inside. theme-color (WP-6.1, §9) matches this surface's own
  dark --ht-paper, not the light default the other two layouts set. -->
<script setup lang="ts">
useHead({ meta: [{ name: 'theme-color', content: '#0f1418' }] })
</script>

<template>
  <div data-surface="counter" class="counter-surface">
    <slot />
  </div>
</template>

<style scoped>
.counter-surface {
  min-height: 100vh;
  background: var(--ht-paper);
  color: var(--ht-ink);
}
</style>
