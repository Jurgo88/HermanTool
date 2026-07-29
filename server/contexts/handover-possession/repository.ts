// Handover & Possession's data access, ScanEvent resolution slice only
// (issue #22). Kept behind a narrow interface so ./scan-resolution.ts is
// testable without a database (Part 4 §14.2), mirroring every other
// context's repository shape. Every method takes `tenantId` as its first
// parameter (FR-33).
import type postgres from 'postgres'
import type { TenantId } from '../_shared'
import type { ScanEvent } from './types'

export interface NewScanEvent {
  assetId: number
  operatorId: string
}

export interface HandoverPossessionRepository {
  insertScanEvent(tenantId: TenantId, params: NewScanEvent): Promise<ScanEvent>
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
  }
}
