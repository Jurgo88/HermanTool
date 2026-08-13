<!-- D-43, UIF-05, NFR-09, FR-34; docs/design/interface-design-foundation.md
  §2, §6 (S-23). The Operator admin surface: light, dense, low-frequency
  (NFR-13). Every page reached through this layout is already gated by
  its own requireOperator call server-side (D-25) — OperatorBar (C-20)
  only needs to know who, not whether. ./auth.vue is the sibling layout
  for the one admin-adjacent screen that must render before that's true:
  login (S-18). theme-color (WP-6.1, §9) matches this surface's light
  --ht-paper. -->
<script setup lang="ts">
// Admin belongs to the Operator's application (NFR-12) — installing from here
// should land on the counter (S-08), not in the Visitor's catalogue — but it
// is a light surface, so it paints the public chrome. The second argument is
// exactly that split.
usePwaHead('operator', 'public')
</script>

<template>
  <div class="admin-surface">
    <OperatorBar />
    <slot />
  </div>
</template>

<style scoped>
.admin-surface {
  min-height: 100vh;
}
</style>
