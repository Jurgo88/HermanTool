<!-- C-12 (D-49, D-40; docs/design/interface-design-foundation.md §3 UI-D-07).
  Per-file state through D-40's sequence — requested, uploading,
  uploaded, confirmed, or error with retry. File selection and state
  display only; the actual request/PUT/confirm calls stay where the rest
  of this codebase's network orchestration already lives (the page),
  since ConditionReport confirms all photos in one batch call, not one
  per file — the parent drives `states`, this component only shows it. -->
<script setup lang="ts">
export type PhotoState = 'requested' | 'uploading' | 'uploaded' | 'confirmed' | 'error'

const props = defineProps<{
  modelValue: File[]
  states: PhotoState[]
  label: string
  addLabel: string
  stateLabels: Record<PhotoState, string>
}>()
const emit = defineEmits<{ 'update:modelValue': [File[]]; retry: [index: number] }>()

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files ? Array.from(input.files) : []
  if (files.length > 0) emit('update:modelValue', [...props.modelValue, ...files])
  input.value = ''
}

function remove(index: number) {
  const next = [...props.modelValue]
  next.splice(index, 1)
  emit('update:modelValue', next)
}

// Cached per File instance so a re-render never mints (and leaks) a new
// blob URL for the same file.
const previewUrls = new WeakMap<File, string>()
function previewUrl(file: File): string {
  let url = previewUrls.get(file)
  if (!url) {
    url = URL.createObjectURL(file)
    previewUrls.set(file, url)
  }
  return url
}
</script>

<template>
  <div class="photo-capture">
    <span class="photo-capture__label">{{ label }}</span>
    <div class="photo-capture__grid">
      <div
        v-for="(file, index) in modelValue"
        :key="`${file.name}-${file.lastModified}-${index}`"
        class="photo-capture__photo"
        :class="`photo-capture__photo--${states[index] ?? 'requested'}`"
      >
        <img :src="previewUrl(file)" :alt="file.name" class="photo-capture__preview" />
        <span class="photo-capture__state">{{ stateLabels[states[index] ?? 'requested'] }}</span>
        <button v-if="states[index] === 'error'" type="button" @click="emit('retry', index)">↻</button>
        <button v-if="states[index] !== 'uploading' && states[index] !== 'confirmed'" type="button" @click="remove(index)">
          ×
        </button>
      </div>
      <label class="photo-capture__add">
        <input type="file" accept="image/*" capture="environment" multiple @change="onFileChange" />
        <span>{{ addLabel }}</span>
      </label>
    </div>
  </div>
</template>

<style scoped>
.photo-capture__label {
  display: block;
  font-family: var(--ht-font-condensed);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: var(--ht-text-1);
  color: var(--ht-ink-muted);
  margin-bottom: var(--ht-space-2);
}

.photo-capture__grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ht-space-2);
}

.photo-capture__photo {
  position: relative;
  width: 88px;
  aspect-ratio: 1;
  border: 1px solid var(--ht-line);
  border-radius: var(--ht-radius-plate);
  overflow: hidden;
  background: var(--ht-surface-sunk);
}

.photo-capture__photo--confirmed {
  border-color: var(--ht-ok);
}

.photo-capture__photo--error {
  border-color: var(--ht-danger);
}

.photo-capture__preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-capture__state {
  position: absolute;
  inset: auto 0 0 0;
  font-size: 10px;
  text-align: center;
  padding: 2px;
  background: rgb(0 0 0 / 55%);
  color: #fff;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.photo-capture__photo button {
  position: absolute;
  top: 2px;
  border: 0;
  border-radius: var(--ht-radius-plate);
  background: rgb(0 0 0 / 55%);
  color: #fff;
  width: 20px;
  height: 20px;
  line-height: 1;
  cursor: pointer;
}

.photo-capture__photo button:first-of-type {
  right: 2px;
}

.photo-capture__photo button:last-of-type {
  left: 2px;
}

.photo-capture__add {
  width: 88px;
  aspect-ratio: 1;
  border: 1px dashed var(--ht-line-strong);
  border-radius: var(--ht-radius-plate);
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: var(--ht-text-1);
  color: var(--ht-ink-muted);
  cursor: pointer;
  padding: var(--ht-space-1);
}

.photo-capture__add input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  overflow: hidden;
}
</style>
