<script setup lang="ts">
const { data: health } = await useFetch('/api/health')
</script>

<template>
  <main>
    <h1>HermanTool</h1>
    <p>Scaffold running. No domain logic implemented yet.</p>
    <pre>{{ health }}</pre>
  </main>
</template>
