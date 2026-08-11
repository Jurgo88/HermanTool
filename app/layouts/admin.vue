<!-- D-43; docs/design/interface-design-foundation.md §2, §6. The Operator
  admin surface: light, dense, low-frequency (NFR-13). The app shell (C-20
  OperatorBar, navigation, logout — S-23/UIF-05) is WP-5.1's own task;
  this layout is deliberately just the surface wrapper until then, so
  admin pages can adopt tokens/base now without waiting on it. -->
<template>
  <div class="admin-surface">
    <slot />
  </div>
</template>

<style scoped>
.admin-surface {
  min-height: 100vh;
}
</style>
