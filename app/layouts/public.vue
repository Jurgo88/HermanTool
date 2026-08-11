<!-- D-43; docs/design/interface-design-foundation.md §2, §6. The Visitor/
  Customer surface: light, calm, honest about money. No chrome beyond the
  page itself — S-01/S-03/S-06/S-07 each own their own header. -->
<template>
  <div class="public-surface">
    <slot />
  </div>
</template>

<style scoped>
.public-surface {
  min-height: 100vh;
}
</style>
