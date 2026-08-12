<!-- C-18 (D-43; docs/design/interface-design-foundation.md §5, P4, FR-43).
  Append-only render of an Asset's attestation history — what gets read
  out in a dispute. Every fact carries Operator attribution and both
  clocks (occurredAt vs recordedAt — D-10: equal for a live scan,
  different for a backdated repair, and the difference itself is shown,
  never hidden). Flattens each RentalAgreement's own facts into one
  ordered list; nothing here edits or reorders what the server returned. -->
<script setup lang="ts">
import { sk } from '~/i18n/sk'
import { formatDateTime } from '~/utils/format'
import type { MonetaryAmountView } from '~/utils/format'

export interface RentalAgreementHistoryView {
  id: number
  operatorId: string
  handoverOutAt: string
  handoverOutRecordedAt: string
  handoverOutBackdateReason: string | null
  handoverInAt: string | null
  handoverInRecordedAt: string | null
  handoverInBackdateReason: string | null
  returnedToPoolAt: string | null
  declaredLostAt: string | null
  declaredLostReason: string | null
  declaredLostOperatorId: string | null
}

export interface ConditionReportHistoryView {
  stage: 'handover_out' | 'handover_in'
  photoObjectKeys: string[]
  operatorId: string
  capturedAt: string
  recordedAt: string
  confirmedAt: string | null
}

export interface DepositHistoryView {
  amount: MonetaryAmountView
  operatorId: string
  deductionReason?: string | null
}

export interface AttestationHistoryEntryView {
  rentalAgreement: RentalAgreementHistoryView
  conditionReports: ConditionReportHistoryView[]
  depositTaken: (DepositHistoryView & { takenAt: string; recordedAt: string }) | null
  depositReturned: (DepositHistoryView & { returnedAt: string; recordedAt: string }) | null
}

interface TimelineFact {
  key: string
  label: string
  occurredAt: string
  recordedAt: string
  operatorName: string
  backdateReason: string | null
  detail: string | null
}

const props = defineProps<{ entries: AttestationHistoryEntryView[]; operatorNames: Record<string, string> }>()

function operatorName(operatorId: string): string {
  return props.operatorNames[operatorId] ?? operatorId
}

const facts = computed<TimelineFact[]>(() => {
  const list: TimelineFact[] = []
  for (const entry of props.entries) {
    const ra = entry.rentalAgreement
    list.push({
      key: `ra-${ra.id}-out`,
      label: sk.assetHistory.factHandoverOut.replace('{id}', String(ra.id)),
      occurredAt: ra.handoverOutAt,
      recordedAt: ra.handoverOutRecordedAt,
      operatorName: operatorName(ra.operatorId),
      backdateReason: ra.handoverOutBackdateReason,
      detail: null,
    })
    for (const report of entry.conditionReports.filter((r) => r.stage === 'handover_out')) {
      list.push({
        key: `ra-${ra.id}-cr-out-${report.capturedAt}`,
        label: sk.assetHistory.factConditionReportOut,
        occurredAt: report.capturedAt,
        recordedAt: report.recordedAt,
        operatorName: operatorName(report.operatorId),
        backdateReason: null,
        detail: report.confirmedAt
          ? sk.assetHistory.photoCountConfirmed.replace('{count}', String(report.photoObjectKeys.length))
          : sk.assetHistory.photoCountUnconfirmed.replace('{count}', String(report.photoObjectKeys.length)),
      })
    }
    if (entry.depositTaken) {
      list.push({
        key: `ra-${ra.id}-deposit-taken`,
        label: sk.assetHistory.factDepositTaken,
        occurredAt: entry.depositTaken.takenAt,
        recordedAt: entry.depositTaken.recordedAt,
        operatorName: operatorName(entry.depositTaken.operatorId),
        backdateReason: null,
        detail: null,
      })
    }
    if (ra.handoverInAt) {
      list.push({
        key: `ra-${ra.id}-in`,
        label: sk.assetHistory.factHandoverIn,
        occurredAt: ra.handoverInAt,
        recordedAt: ra.handoverInRecordedAt ?? ra.handoverInAt,
        operatorName: operatorName(ra.operatorId),
        backdateReason: ra.handoverInBackdateReason,
        detail: null,
      })
    }
    for (const report of entry.conditionReports.filter((r) => r.stage === 'handover_in')) {
      list.push({
        key: `ra-${ra.id}-cr-in-${report.capturedAt}`,
        label: sk.assetHistory.factConditionReportIn,
        occurredAt: report.capturedAt,
        recordedAt: report.recordedAt,
        operatorName: operatorName(report.operatorId),
        backdateReason: null,
        detail: report.confirmedAt
          ? sk.assetHistory.photoCountConfirmed.replace('{count}', String(report.photoObjectKeys.length))
          : sk.assetHistory.photoCountUnconfirmed.replace('{count}', String(report.photoObjectKeys.length)),
      })
    }
    if (entry.depositReturned) {
      list.push({
        key: `ra-${ra.id}-deposit-returned`,
        label: sk.assetHistory.factDepositReturned,
        occurredAt: entry.depositReturned.returnedAt,
        recordedAt: entry.depositReturned.recordedAt,
        operatorName: operatorName(entry.depositReturned.operatorId),
        backdateReason: null,
        detail: entry.depositReturned.deductionReason ?? null,
      })
    }
    if (ra.declaredLostAt) {
      list.push({
        key: `ra-${ra.id}-lost`,
        label: sk.assetHistory.factDeclaredLost,
        occurredAt: ra.declaredLostAt,
        recordedAt: ra.declaredLostAt,
        operatorName: operatorName(ra.declaredLostOperatorId ?? ra.operatorId),
        backdateReason: null,
        detail: ra.declaredLostReason,
      })
    }
    if (ra.returnedToPoolAt) {
      list.push({
        key: `ra-${ra.id}-pool`,
        label: sk.assetHistory.factReturnedToPool,
        occurredAt: ra.returnedToPoolAt,
        recordedAt: ra.returnedToPoolAt,
        operatorName: operatorName(ra.operatorId),
        backdateReason: null,
        detail: null,
      })
    }
  }
  return list
})
</script>

<template>
  <ol class="attestation-timeline">
    <li v-for="fact in facts" :key="fact.key" class="attestation-timeline__fact">
      <div class="attestation-timeline__label">{{ fact.label }}</div>
      <div class="attestation-timeline__clock">
        <span class="attestation-timeline__key">{{ sk.assetHistory.occurredLabel }}</span>
        <span class="attestation-timeline__value">{{ formatDateTime(fact.occurredAt) }}</span>
      </div>
      <div v-if="fact.recordedAt !== fact.occurredAt" class="attestation-timeline__clock">
        <span class="attestation-timeline__key">{{ sk.assetHistory.recordedLabel }}</span>
        <span class="attestation-timeline__value">{{ formatDateTime(fact.recordedAt) }}</span>
      </div>
      <p v-if="fact.backdateReason" class="attestation-timeline__note">
        {{ sk.assetHistory.backdateReasonPrefix }} {{ fact.backdateReason }}
      </p>
      <p v-if="fact.detail" class="attestation-timeline__note">{{ fact.detail }}</p>
      <div class="attestation-timeline__operator">{{ sk.assetHistory.operatorPrefix }} {{ fact.operatorName }}</div>
    </li>
  </ol>
</template>

<style scoped>
.attestation-timeline {
  list-style: none;
  margin: 0;
  padding: 0;
}

.attestation-timeline__fact {
  background: var(--ht-surface);
  border: 1px solid var(--ht-line);
  border-left: 3px solid var(--ht-line-strong);
  border-radius: var(--ht-radius-plate);
  padding: var(--ht-space-3);
  margin-bottom: var(--ht-space-2);
}

.attestation-timeline__label {
  font-weight: 600;
  font-size: var(--ht-text-3);
  margin-bottom: var(--ht-space-1);
}

.attestation-timeline__clock {
  display: flex;
  gap: var(--ht-space-2);
  font-size: var(--ht-text-2);
  color: var(--ht-ink-muted);
}

.attestation-timeline__key {
  font-family: var(--ht-font-condensed);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: var(--ht-text-1);
  min-width: 90px;
  color: var(--ht-ink-muted);
}

.attestation-timeline__value {
  font-family: var(--ht-font-mono);
  font-size: var(--ht-text-2);
  color: var(--ht-ink);
}

.attestation-timeline__note {
  margin: var(--ht-space-1) 0 0;
  font-size: var(--ht-text-2);
}

.attestation-timeline__operator {
  margin-top: var(--ht-space-1);
  font-size: var(--ht-text-1);
  color: var(--ht-ink-muted);
}
</style>
