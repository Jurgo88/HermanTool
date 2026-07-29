// Handover & Possession's data access. Kept behind a narrow interface so
// the domain logic in ./scan-resolution.ts, ./handover-out.ts and
// ./handover-in.ts is testable without a database (Part 4 §14.2),
// mirroring every other context's repository shape. Every method takes
// `tenantId` as its first parameter (FR-33).
import type postgres from 'postgres'
import type { CurrencyCode, MonetaryAmount, TenantId } from '../_shared'
import { createPostgresAssetRegistryRepository, type AssetRegistryRepository } from '../asset-registry'
import type {
  ConditionReport,
  ConditionReportStage,
  DepositReturned,
  DepositTaken,
  RentalAgreement,
  ScanEvent,
} from './types'

export interface NewScanEvent {
  assetId: number
  operatorId: string
}

export interface NewRentalAgreement {
  reservationId: number
  customerId: number
  assetId: number
  operatorId: string
  termsVersion: string
}

export interface NewConditionReport {
  rentalAgreementId: number
  stage: ConditionReportStage
  photoObjectKeys: string[]
  operatorId: string
}

export interface NewDepositTaken {
  rentalAgreementId: number
  amount: MonetaryAmount
  operatorId: string
}

export interface NewDepositReturned {
  rentalAgreementId: number
  amount: MonetaryAmount
  deductionReason: string | null
  operatorId: string
}

export interface HandoverPossessionRepository {
  insertScanEvent(tenantId: TenantId, params: NewScanEvent): Promise<ScanEvent>

  insertRentalAgreement(tenantId: TenantId, params: NewRentalAgreement): Promise<RentalAgreement>
  getRentalAgreement(tenantId: TenantId, id: number): Promise<RentalAgreement | null>

  // HandoverIn's entry point: the one RentalAgreement (if any) still
  // awaiting return for this Asset. D-04/D-13 make this unique in
  // practice — an Asset holds at most one open Agreement at a time.
  getOpenRentalAgreementForAsset(tenantId: TenantId, assetId: number): Promise<RentalAgreement | null>

  // Guarded transition: succeeds only if handover_in_at is currently
  // null, mirroring every other guarded-transition method in this
  // codebase (e.g. Availability & Reservation's transitionReservationState).
  setHandoverInAt(tenantId: TenantId, rentalAgreementId: number, at: Date): Promise<RentalAgreement | null>

  setSettlementCompletedAt(tenantId: TenantId, rentalAgreementId: number, at: Date): Promise<RentalAgreement | null>

  markReturnedToPool(tenantId: TenantId, rentalAgreementId: number, at: Date): Promise<RentalAgreement | null>

  insertConditionReport(tenantId: TenantId, params: NewConditionReport): Promise<ConditionReport>
  listConditionReportsForAgreement(tenantId: TenantId, rentalAgreementId: number): Promise<ConditionReport[]>

  insertDepositTaken(tenantId: TenantId, params: NewDepositTaken): Promise<DepositTaken>
  getDepositTakenForAgreement(tenantId: TenantId, rentalAgreementId: number): Promise<DepositTaken | null>

  insertDepositReturned(tenantId: TenantId, params: NewDepositReturned): Promise<DepositReturned>

  // Every RentalAgreement whose Settlement has completed but whose Asset
  // has not yet been recorded as returned to the pool — the candidate
  // set markAssetReturnedToPool's caller checks one at a time against
  // D-09's day-after rule. Small and self-scoped to this context's own
  // table; no cross-context join (D-02) — the caller composes Asset
  // Registry's and Availability & Reservation's own repositories for the
  // rest of what it needs per candidate.
  listSettledRentalAgreementsPendingPoolReturn(tenantId: TenantId): Promise<RentalAgreement[]>

  // Composes Asset Registry's repository bound to the SAME transaction
  // (Part 4 §16 D-33's precedent, extended here) — performHandoverOut's
  // and performHandoverIn's Asset status transitions must commit or roll
  // back atomically with the RentalAgreement/ConditionReport/DepositTaken
  // rows they belong with. This calls Asset Registry's REPOSITORY
  // primitives directly (updateAssetStatus, insertStatusEvent), never its
  // domain functions (markAssetRentable etc.) — those each open their own
  // transaction, which would violate the "no nested transactions"
  // invariant every repository in this codebase enforces.
  transaction<T>(
    fn: (repo: HandoverPossessionRepository, assetRegistryRepo: AssetRegistryRepository) => Promise<T>,
  ): Promise<T>
}

interface ScanEventRow {
  id: number
  tenant_id: string
  asset_id: number
  operator_id: string
  occurred_at: Date
}

function mapScanEvent(row: ScanEventRow): ScanEvent {
  return {
    id: row.id,
    tenantId: row.tenant_id as TenantId,
    assetId: row.asset_id,
    operatorId: row.operator_id,
    occurredAt: row.occurred_at,
  }
}

interface RentalAgreementRow {
  id: number
  tenant_id: string
  reservation_id: number
  customer_id: number
  asset_id: number
  operator_id: string
  terms_version: string
  handover_out_at: Date
  handover_in_at: Date | null
  settlement_completed_at: Date | null
  returned_to_pool_at: Date | null
}

function mapRentalAgreement(row: RentalAgreementRow): RentalAgreement {
  return {
    id: row.id,
    tenantId: row.tenant_id as TenantId,
    reservationId: row.reservation_id,
    customerId: row.customer_id,
    assetId: row.asset_id,
    operatorId: row.operator_id,
    termsVersion: row.terms_version,
    handoverOutAt: row.handover_out_at,
    handoverInAt: row.handover_in_at,
    settlementCompletedAt: row.settlement_completed_at,
    returnedToPoolAt: row.returned_to_pool_at,
  }
}

interface ConditionReportRow {
  id: number
  tenant_id: string
  rental_agreement_id: number
  stage: ConditionReportStage
  photo_object_keys: string[]
  operator_id: string
  captured_at: Date
}

function mapConditionReport(row: ConditionReportRow): ConditionReport {
  return {
    id: row.id,
    tenantId: row.tenant_id as TenantId,
    rentalAgreementId: row.rental_agreement_id,
    stage: row.stage,
    photoObjectKeys: row.photo_object_keys,
    operatorId: row.operator_id,
    capturedAt: row.captured_at,
  }
}

interface DepositTakenRow {
  id: number
  tenant_id: string
  rental_agreement_id: number
  amount_cents: number
  currency: CurrencyCode
  operator_id: string
  taken_at: Date
}

function mapDepositTaken(row: DepositTakenRow): DepositTaken {
  return {
    id: row.id,
    tenantId: row.tenant_id as TenantId,
    rentalAgreementId: row.rental_agreement_id,
    amount: { amount: row.amount_cents, currency: row.currency },
    operatorId: row.operator_id,
    takenAt: row.taken_at,
  }
}

interface DepositReturnedRow {
  id: number
  tenant_id: string
  rental_agreement_id: number
  amount_cents: number
  currency: CurrencyCode
  deduction_reason: string | null
  operator_id: string
  returned_at: Date
}

function mapDepositReturned(row: DepositReturnedRow): DepositReturned {
  return {
    id: row.id,
    tenantId: row.tenant_id as TenantId,
    rentalAgreementId: row.rental_agreement_id,
    amount: { amount: row.amount_cents, currency: row.currency },
    deductionReason: row.deduction_reason,
    operatorId: row.operator_id,
    returnedAt: row.returned_at,
  }
}

export function createPostgresHandoverPossessionRepository(
  sql: postgres.Sql | postgres.TransactionSql,
): HandoverPossessionRepository {
  return {
    async insertScanEvent(tenantId, { assetId, operatorId }) {
      const rows = await sql<ScanEventRow[]>`
        insert into scan_events (tenant_id, asset_id, operator_id)
        values (${tenantId}, ${assetId}, ${operatorId})
        returning *
      `
      return mapScanEvent(rows[0]!)
    },

    async insertRentalAgreement(tenantId, { reservationId, customerId, assetId, operatorId, termsVersion }) {
      const rows = await sql<RentalAgreementRow[]>`
        insert into rental_agreements (
          tenant_id, reservation_id, customer_id, asset_id, operator_id, terms_version
        ) values (
          ${tenantId}, ${reservationId}, ${customerId}, ${assetId}, ${operatorId}, ${termsVersion}
        )
        returning *
      `
      return mapRentalAgreement(rows[0]!)
    },

    async getRentalAgreement(tenantId, id) {
      const rows = await sql<RentalAgreementRow[]>`
        select * from rental_agreements where tenant_id = ${tenantId} and id = ${id}
      `
      return rows[0] ? mapRentalAgreement(rows[0]) : null
    },

    async getOpenRentalAgreementForAsset(tenantId, assetId) {
      const rows = await sql<RentalAgreementRow[]>`
        select * from rental_agreements
        where tenant_id = ${tenantId} and asset_id = ${assetId} and handover_in_at is null
        order by id desc
        limit 1
      `
      return rows[0] ? mapRentalAgreement(rows[0]) : null
    },

    async setHandoverInAt(tenantId, rentalAgreementId, at) {
      const rows = await sql<RentalAgreementRow[]>`
        update rental_agreements
        set handover_in_at = ${at}
        where tenant_id = ${tenantId} and id = ${rentalAgreementId} and handover_in_at is null
        returning *
      `
      return rows[0] ? mapRentalAgreement(rows[0]) : null
    },

    async setSettlementCompletedAt(tenantId, rentalAgreementId, at) {
      const rows = await sql<RentalAgreementRow[]>`
        update rental_agreements
        set settlement_completed_at = ${at}
        where tenant_id = ${tenantId} and id = ${rentalAgreementId} and settlement_completed_at is null
        returning *
      `
      return rows[0] ? mapRentalAgreement(rows[0]) : null
    },

    async markReturnedToPool(tenantId, rentalAgreementId, at) {
      const rows = await sql<RentalAgreementRow[]>`
        update rental_agreements
        set returned_to_pool_at = ${at}
        where tenant_id = ${tenantId} and id = ${rentalAgreementId} and returned_to_pool_at is null
        returning *
      `
      return rows[0] ? mapRentalAgreement(rows[0]) : null
    },

    async insertConditionReport(tenantId, { rentalAgreementId, stage, photoObjectKeys, operatorId }) {
      const rows = await sql<ConditionReportRow[]>`
        insert into condition_reports (tenant_id, rental_agreement_id, stage, photo_object_keys, operator_id)
        values (${tenantId}, ${rentalAgreementId}, ${stage}, ${sql.array(photoObjectKeys)}, ${operatorId})
        returning *
      `
      return mapConditionReport(rows[0]!)
    },

    async listConditionReportsForAgreement(tenantId, rentalAgreementId) {
      const rows = await sql<ConditionReportRow[]>`
        select * from condition_reports
        where tenant_id = ${tenantId} and rental_agreement_id = ${rentalAgreementId}
        order by id
      `
      return rows.map(mapConditionReport)
    },

    async insertDepositTaken(tenantId, { rentalAgreementId, amount, operatorId }) {
      const rows = await sql<DepositTakenRow[]>`
        insert into deposit_taken (tenant_id, rental_agreement_id, amount_cents, currency, operator_id)
        values (${tenantId}, ${rentalAgreementId}, ${amount.amount}, ${amount.currency}, ${operatorId})
        returning *
      `
      return mapDepositTaken(rows[0]!)
    },

    async getDepositTakenForAgreement(tenantId, rentalAgreementId) {
      const rows = await sql<DepositTakenRow[]>`
        select * from deposit_taken where tenant_id = ${tenantId} and rental_agreement_id = ${rentalAgreementId}
      `
      return rows[0] ? mapDepositTaken(rows[0]) : null
    },

    async insertDepositReturned(tenantId, { rentalAgreementId, amount, deductionReason, operatorId }) {
      const rows = await sql<DepositReturnedRow[]>`
        insert into deposit_returned (
          tenant_id, rental_agreement_id, amount_cents, currency, deduction_reason, operator_id
        ) values (
          ${tenantId}, ${rentalAgreementId}, ${amount.amount}, ${amount.currency}, ${deductionReason}, ${operatorId}
        )
        returning *
      `
      return mapDepositReturned(rows[0]!)
    },

    async listSettledRentalAgreementsPendingPoolReturn(tenantId) {
      const rows = await sql<RentalAgreementRow[]>`
        select * from rental_agreements
        where tenant_id = ${tenantId} and settlement_completed_at is not null and returned_to_pool_at is null
        order by id
      `
      return rows.map(mapRentalAgreement)
    },

    async transaction<T>(
      fn: (repo: HandoverPossessionRepository, assetRegistryRepo: AssetRegistryRepository) => Promise<T>,
    ) {
      // See Asset Registry's repository for why this guard exists:
      // `TransactionSql` has no `.begin()` — nothing here ever calls
      // `.transaction()` on an already-transaction-bound repo.
      if (!('begin' in sql)) {
        throw new Error('Nested transactions are not supported — this repository is already bound to one.')
      }
      return sql.begin((trx) =>
        fn(createPostgresHandoverPossessionRepository(trx), createPostgresAssetRegistryRepository(trx)),
      ) as Promise<T>
    },
  }
}
