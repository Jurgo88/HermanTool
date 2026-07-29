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

// F8/D-22: pinSalt/pinHash are null until the Operator has set a PIN via
// ./operator-pin.ts's setOperatorPin — see that module for why a PIN
// exists at all (per-Operator reconfirmation on a shared counter phone).
export interface OperatorWithPin extends Operator {
  pinSalt: string | null
  pinHash: string | null
}

export interface OperatorRepository {
  findByAuthUserId(authUserId: string): Promise<Operator | null>
  listForTenant(tenantId: TenantId): Promise<OperatorWithPin[]>
  setPin(operatorId: string, params: { pinSalt: string; pinHash: string }): Promise<void>
}

interface OperatorRow {
  id: string
  tenant_id: string
  display_name: string
}

function mapOperator(row: OperatorRow): Operator {
  return { id: row.id, tenantId: row.tenant_id as TenantId, displayName: row.display_name }
}

interface OperatorWithPinRow extends OperatorRow {
  pin_salt: string | null
  pin_hash: string | null
}

function mapOperatorWithPin(row: OperatorWithPinRow): OperatorWithPin {
  return { ...mapOperator(row), pinSalt: row.pin_salt, pinHash: row.pin_hash }
}

export function createPostgresOperatorRepository(sql: postgres.Sql): OperatorRepository {
  return {
    async findByAuthUserId(authUserId) {
      const rows = await sql<OperatorRow[]>`select * from operators where id = ${authUserId}`
      return rows[0] ? mapOperator(rows[0]) : null
    },

    async listForTenant(tenantId) {
      const rows = await sql<OperatorWithPinRow[]>`select * from operators where tenant_id = ${tenantId}`
      return rows.map(mapOperatorWithPin)
    },

    async setPin(operatorId, { pinSalt, pinHash }) {
      await sql`update operators set pin_salt = ${pinSalt}, pin_hash = ${pinHash} where id = ${operatorId}`
    },
  }
}
