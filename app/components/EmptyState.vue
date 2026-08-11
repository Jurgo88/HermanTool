<!-- C-06 (D-43; docs/design/interface-design-foundation.md §5). One
  sentence + one action — never a bare "no data". `message` is required
  and always real sk.ts copy (D-20); the default slot holds the one
  action, when there is one (e.g. an AppButton or NuxtLink). -->
<script setup lang="ts">
defineProps<{ message: string }>()
</script>

<template>
  <div class="empty-state">
    <p>{{ message }}</p>
    <slot />
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ht-space-3);
  padding: var(--ht-space-5);
  color: var(--ht-ink-muted);
}

.empty-state p {
  margin: 0;
}
</style>
