// Operator identity (D-01, D-22, FR-33, FR-34). Not a bounded context —
// Tenant & Access is [Future] — this is scaffold-level infrastructure,
// the same status as ../contexts/_shared/tenant.ts. `operators.id` is a
// real auth.users id: an Operator seat is an authenticated principal,
// never a profile row disconnected from a real credential.
import type postgres from 'postgres'
import type { TenantId } from '../contexts/_shared'

export interface Operator {
  id: string
  tenantId: TenantId
  displayName: string
}

export interface OperatorRepository {
  findByAuthUserId(authUserId: string): Promise<Operator | null>
}

interface OperatorRow {
  id: string
  tenant_id: string
  display_name: string
}

function mapOperator(row: OperatorRow): Operator {
  return { id: row.id, tenantId: row.tenant_id as TenantId, displayName: row.display_name }
}

export function createPostgresOperatorRepository(sql: postgres.Sql): OperatorRepository {
  return {
    async findByAuthUserId(authUserId) {
      const rows = await sql<OperatorRow[]>`select * from operators where id = ${authUserId}`
      return rows[0] ? mapOperator(rows[0]) : null
    },
  }
}
