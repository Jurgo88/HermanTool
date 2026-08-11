<!-- C-09 (D-43; docs/design/interface-design-foundation.md §4.1, §5).
  Mono, stamped — tag codes, Asset IDs, RentalAgreement numbers: the
  class of value an Operator reads aloud, compares against a physical
  sticker, or defends in a dispute. -->
<template>
  <span class="tag-code-plate">
    <slot />
  </span>
</template>

<style scoped>
.tag-code-plate {
  font-family: var(--ht-font-mono);
  font-size: var(--ht-text-2);
  background: var(--ht-surface-sunk);
  border: 1px solid var(--ht-line);
  border-radius: var(--ht-radius-plate);
  padding: 2px 6px;
  display: inline-block;
}
</style>
