<!-- C-25 (FR-24, D-10, S-17; design foundation §6). The "record it late"
  part of a HandoverOut or HandoverIn: the drill went out during an outage,
  or the scan was forgotten, and the record is written afterwards. It
  appends a new fact with the real time and a reason (nothing is edited,
  P1), and the attestation timeline then shows both clocks. Off by default,
  because the ordinary case is a live scan. The time is sent as typed; the
  server resolves it in the Tenant's timezone (D-51). -->
<script setup lang="ts">
import { sk } from '~/i18n/sk'
import type { LateAttestation } from '~/utils/late-attestation'

const model = defineModel<LateAttestation>({ required: true })

function update(patch: Partial<LateAttestation>) {
  model.value = { ...model.value, ...patch }
}
</script>

<template>
  <fieldset class="late-attestation">
    <legend>{{ sk.lateAttestation.legend }}</legend>
    <label class="late-attestation__toggle">
      <input
        type="checkbox"
        :checked="model.enabled"
        @change="update({ enabled: ($event.target as HTMLInputElement).checked })"
      />
      {{ sk.lateAttestation.toggleLabel }}
    </label>

    <template v-if="model.enabled">
      <p class="late-attestation__hint">{{ sk.lateAttestation.hint }}</p>
      <AppField :label="sk.lateAttestation.occurredAtLabel">
        <template #default="slotProps">
          <input
            :id="slotProps.id"
            type="datetime-local"
            required
            :value="model.occurredAt"
            @input="update({ occurredAt: ($event.target as HTMLInputElement).value })"
          />
        </template>
      </AppField>
      <AppField :label="sk.lateAttestation.reasonLabel">
        <template #default="slotProps">
          <input
            :id="slotProps.id"
            type="text"
            required
            autocomplete="off"
            :value="model.reason"
            @input="update({ reason: ($event.target as HTMLInputElement).value })"
          />
        </template>
      </AppField>
    </template>
  </fieldset>
</template>

<style scoped>
.late-attestation {
  border: 1px solid var(--ht-line);
  border-radius: var(--ht-radius-card);
  padding: var(--ht-space-3);
  display: flex;
  flex-direction: column;
  gap: var(--ht-space-3);
}

.late-attestation legend {
  font-family: var(--ht-font-condensed);
  font-weight: 600;
  padding: 0 var(--ht-space-1);
}

.late-attestation__toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--ht-space-2);
  min-height: var(--ht-hit-counter);
}

.late-attestation__toggle input {
  width: var(--ht-space-5);
  height: var(--ht-space-5);
}

.late-attestation__hint {
  color: var(--ht-ink-muted);
  font-size: var(--ht-text-2);
}
</style>
