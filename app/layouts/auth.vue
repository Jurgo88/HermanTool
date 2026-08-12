<!-- D-43; docs/design/interface-design-foundation.md §2, §6 (S-18). The one
  admin-adjacent screen that renders before an Operator is signed in —
  deliberately outside ./admin.vue's OperatorBar shell (C-20), which
  assumes an authenticated Operator to name. -->
<template>
  <div class="auth-surface">
    <slot />
  </div>
</template>

<style scoped>
.auth-surface {
  min-height: 100vh;
}
</style>
