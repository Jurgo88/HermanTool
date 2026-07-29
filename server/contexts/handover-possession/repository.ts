// Handover & Possession's data access. Kept behind a narrow interface so
// the domain logic in ./scan-resolution.ts and ./handover-out.ts is
// testable without a database (Part 4 §14.2), mirroring every other
// context's repository shape. Every method takes `tenantId` as its
// first parameter (FR-33).
import type postgres from 'postgres'
import type { CurrencyCode, MonetaryAmount, TenantId } from '../_shared'
import { createPostgresAssetRegistryRepository, type AssetRegistryRepository } from '../asset-registry'
import type { ConditionReport, ConditionReportStage, DepositTaken, RentalAgreement, ScanEvent } from './types'

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

export interface HandoverPossessionRepository {
  insertScanEvent(tenantId: TenantId, params: NewScanEvent): Promise<ScanEvent>

  insertRentalAgreement(tenantId: TenantId, params: NewRentalAgreement): Promise<RentalAgreement>
  getRentalAgreement(tenantId: TenantId, id: number): Promise<RentalAgreement | null>

  insertConditionReport(tenantId: TenantId, params: NewConditionReport): Promise<ConditionReport>
  insertDepositTaken(tenantId: TenantId, params: NewDepositTaken): Promise<DepositTaken>

  // Composes Asset Registry's repository bound to the SAME transaction
  // (Part 4 §16 D-33's precedent, extended here) — performHandoverOut's
  // Asset status transition (rentable -> in_possession) must commit or
  // roll back atomically with the RentalAgreement/ConditionReport/
  // DepositTaken rows it belongs with. This calls Asset Registry's
  // REPOSITORY primitives directly (updateAssetStatus, insertStatusEvent),
  // never its domain functions (markAssetRentable etc.) — those each
  // open their own transaction, which would violate the "no nested
  // transactions" invariant every repository in this codebase enforces.
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

    async insertConditionReport(tenantId, { rentalAgreementId, stage, photoObjectKeys, operatorId }) {
      const rows = await sql<ConditionReportRow[]>`
        insert into condition_reports (tenant_id, rental_agreement_id, stage, photo_object_keys, operator_id)
        values (${tenantId}, ${rentalAgreementId}, ${stage}, ${sql.array(photoObjectKeys)}, ${operatorId})
        returning *
      `
      return mapConditionReport(rows[0]!)
    },

    async insertDepositTaken(tenantId, { rentalAgreementId, amount, operatorId }) {
      const rows = await sql<DepositTakenRow[]>`
        insert into deposit_taken (tenant_id, rental_agreement_id, amount_cents, currency, operator_id)
        values (${tenantId}, ${rentalAgreementId}, ${amount.amount}, ${amount.currency}, ${operatorId})
        returning *
      `
      return mapDepositTaken(rows[0]!)
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
