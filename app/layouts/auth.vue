<!-- D-43; docs/design/interface-design-foundation.md §2, §6 (S-18). The one
  admin-adjacent screen that renders before an Operator is signed in —
  deliberately outside ./admin.vue's OperatorBar shell (C-20), which
  assumes an authenticated Operator to name. theme-color (WP-6.1, §9)
  matches the light --ht-paper the eventual admin surface uses too. -->
<script setup lang="ts">
// Same split as admin.vue (NFR-12): login is the Operator application's entry
// point, so it must offer that manifest and not the Visitor's, but it is a
// light surface. It matters here specifically — an installed counter whose
// session expired relaunches into this screen, and a manifest mismatch at
// that moment is what makes a phone treat it as a different application.
usePwaHead('operator', 'public')
</script>

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
