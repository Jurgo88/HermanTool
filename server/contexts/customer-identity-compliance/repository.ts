// Customer Identity & Compliance's data access, Customer/IdentityEvidence
// slice only (issue #29). Kept behind a narrow interface so
// ./customer.ts and ./identity-evidence.ts are testable without a
// database (Part 4 §14.2), mirroring every other context's repository
// shape. Every method takes `tenantId` as its first parameter (FR-33).
import type postgres from 'postgres'
import type { TenantId } from '../_shared'
import type {
  Customer,
  CustomerAccessLink,
  IdentityEvidence,
  IdentityEvidenceAccessEvent,
  IdentityVerification,
  IdentityVerificationOutcome,
} from './types'

export interface NewCustomer {
  reservationGroupId: number
  name: string
  email: string
  phone: string
}

export interface NewIdentityEvidence {
  customerId: number
  objectKey: string
  retentionDeadline: Date
}

export type NewIdentityVerification =
  | { customerId: number; identityEvidenceId: number; operatorId: string; outcome: 'verified'; reason: null }
  | { customerId: number; identityEvidenceId: number; operatorId: string; outcome: 'rejected'; reason: string }

export interface NewCustomerAccessLink {
  customerId: number
  tokenHash: string
  expiresAt: Date
}

export interface CustomerIdentityComplianceRepository {
  insertCustomer(tenantId: TenantId, params: NewCustomer): Promise<Customer>
  getCustomer(tenantId: TenantId, id: number): Promise<Customer | null>
  getCustomerByReservationGroup(tenantId: TenantId, reservationGroupId: number): Promise<Customer | null>

  insertIdentityEvidence(tenantId: TenantId, params: NewIdentityEvidence): Promise<IdentityEvidence>
  getIdentityEvidence(tenantId: TenantId, id: number): Promise<IdentityEvidence | null>

  insertIdentityEvidenceAccessEvent(
    tenantId: TenantId,
    params: { identityEvidenceId: number; operatorId: string },
  ): Promise<IdentityEvidenceAccessEvent>

  insertIdentityVerification(tenantId: TenantId, params: NewIdentityVerification): Promise<IdentityVerification>

  // FR-14's precondition query: has this Customer EVER had a 'verified'
  // IdentityVerification recorded? Read across every row rather than
  // "the latest one" — a Customer rejected once and verified later on a
  // second document (D-15's append-only attestation model) must still
  // pass, and nothing here assumes exactly one row exists per Customer.
  hasSuccessfulIdentityVerification(tenantId: TenantId, customerId: number): Promise<boolean>

  insertCustomerAccessLink(tenantId: TenantId, params: NewCustomerAccessLink): Promise<CustomerAccessLink>

  // D-23: looked up by the hash of the bearer token a public, unauthenticated
  // route received — never by id, since the caller (a Visitor with a link,
  // not a session) has nothing else to identify it by.
  getCustomerAccessLinkByTokenHash(tenantId: TenantId, tokenHash: string): Promise<CustomerAccessLink | null>

  // D-23: "its purpose ends at HandoverOut, and so does it." Revokes every
  // still-active link for this Customer — in practice at most one (issued
  // once, per ./customer-access-link.ts), but this is not assumed.
  revokeCustomerAccessLinksForCustomer(tenantId: TenantId, customerId: number, at: Date): Promise<void>
}

interface CustomerRow {
  id: number
  tenant_id: string
  reservation_group_id: number
  name: string
  email: string
  phone: string
  created_at: Date
}

function mapCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    tenantId: row.tenant_id as TenantId,
    reservationGroupId: row.reservation_group_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    createdAt: row.created_at,
  }
}

interface IdentityEvidenceRow {
  id: number
  tenant_id: string
  customer_id: number
  object_key: string
  retention_deadline: Date
  created_at: Date
}

function mapIdentityEvidence(row: IdentityEvidenceRow): IdentityEvidence {
  return {
    id: row.id,
    tenantId: row.tenant_id as TenantId,
    customerId: row.customer_id,
    objectKey: row.object_key,
    retentionDeadline: row.retention_deadline,
    createdAt: row.created_at,
  }
}

interface AccessEventRow {
  id: number
  tenant_id: string
  identity_evidence_id: number
  operator_id: string
  accessed_at: Date
}

function mapAccessEvent(row: AccessEventRow): IdentityEvidenceAccessEvent {
  return {
    id: row.id,
    tenantId: row.tenant_id as TenantId,
    identityEvidenceId: row.identity_evidence_id,
    operatorId: row.operator_id,
    accessedAt: row.accessed_at,
  }
}

interface IdentityVerificationRow {
  id: number
  tenant_id: string
  customer_id: number
  identity_evidence_id: number
  operator_id: string
  outcome: IdentityVerificationOutcome
  reason: string | null
  occurred_at: Date
}

function mapIdentityVerification(row: IdentityVerificationRow): IdentityVerification {
  const base = {
    id: row.id,
    tenantId: row.tenant_id as TenantId,
    customerId: row.customer_id,
    identityEvidenceId: row.identity_evidence_id,
    operatorId: row.operator_id,
    occurredAt: row.occurred_at,
  }
  // The migration's check constraint guarantees reason is non-null iff
  // outcome is 'rejected' — this cast makes that fact visible to
  // TypeScript instead of widening back to `string | null` here.
  return row.outcome === 'rejected'
    ? { ...base, outcome: 'rejected', reason: row.reason! }
    : { ...base, outcome: 'verified', reason: null }
}

interface CustomerAccessLinkRow {
  id: number
  tenant_id: string
  customer_id: number
  token_hash: string
  created_at: Date
  expires_at: Date
  revoked_at: Date | null
}

function mapCustomerAccessLink(row: CustomerAccessLinkRow): CustomerAccessLink {
  return {
    id: row.id,
    tenantId: row.tenant_id as TenantId,
    customerId: row.customer_id,
    tokenHash: row.token_hash,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  }
}

export function createPostgresCustomerIdentityComplianceRepository(
  sql: postgres.Sql | postgres.TransactionSql,
): CustomerIdentityComplianceRepository {
  return {
    async insertCustomer(tenantId, { reservationGroupId, name, email, phone }) {
      const rows = await sql<CustomerRow[]>`
        insert into customers (tenant_id, reservation_group_id, name, email, phone)
        values (${tenantId}, ${reservationGroupId}, ${name}, ${email}, ${phone})
        returning *
      `
      return mapCustomer(rows[0]!)
    },

    async getCustomer(tenantId, id) {
      const rows = await sql<CustomerRow[]>`select * from customers where tenant_id = ${tenantId} and id = ${id}`
      return rows[0] ? mapCustomer(rows[0]) : null
    },

    async getCustomerByReservationGroup(tenantId, reservationGroupId) {
      const rows = await sql<CustomerRow[]>`
        select * from customers where tenant_id = ${tenantId} and reservation_group_id = ${reservationGroupId}
      `
      return rows[0] ? mapCustomer(rows[0]) : null
    },

    async insertIdentityEvidence(tenantId, { customerId, objectKey, retentionDeadline }) {
      const rows = await sql<IdentityEvidenceRow[]>`
        insert into identity_evidence (tenant_id, customer_id, object_key, retention_deadline)
        values (${tenantId}, ${customerId}, ${objectKey}, ${retentionDeadline})
        returning *
      `
      return mapIdentityEvidence(rows[0]!)
    },

    async getIdentityEvidence(tenantId, id) {
      const rows = await sql<IdentityEvidenceRow[]>`
        select * from identity_evidence where tenant_id = ${tenantId} and id = ${id}
      `
      return rows[0] ? mapIdentityEvidence(rows[0]) : null
    },

    async insertIdentityEvidenceAccessEvent(tenantId, { identityEvidenceId, operatorId }) {
      const rows = await sql<AccessEventRow[]>`
        insert into identity_evidence_access_events (tenant_id, identity_evidence_id, operator_id)
        values (${tenantId}, ${identityEvidenceId}, ${operatorId})
        returning *
      `
      return mapAccessEvent(rows[0]!)
    },

    async insertIdentityVerification(tenantId, { customerId, identityEvidenceId, operatorId, outcome, reason }) {
      const rows = await sql<IdentityVerificationRow[]>`
        insert into identity_verifications (
          tenant_id, customer_id, identity_evidence_id, operator_id, outcome, reason
        ) values (
          ${tenantId}, ${customerId}, ${identityEvidenceId}, ${operatorId}, ${outcome}, ${reason}
        )
        returning *
      `
      return mapIdentityVerification(rows[0]!)
    },

    async hasSuccessfulIdentityVerification(tenantId, customerId) {
      const rows = await sql<{ id: number }[]>`
        select id from identity_verifications
        where tenant_id = ${tenantId} and customer_id = ${customerId} and outcome = 'verified'
        limit 1
      `
      return rows.length > 0
    },

    async insertCustomerAccessLink(tenantId, { customerId, tokenHash, expiresAt }) {
      const rows = await sql<CustomerAccessLinkRow[]>`
        insert into customer_access_links (tenant_id, customer_id, token_hash, expires_at)
        values (${tenantId}, ${customerId}, ${tokenHash}, ${expiresAt})
        returning *
      `
      return mapCustomerAccessLink(rows[0]!)
    },

    async getCustomerAccessLinkByTokenHash(tenantId, tokenHash) {
      const rows = await sql<CustomerAccessLinkRow[]>`
        select * from customer_access_links where tenant_id = ${tenantId} and token_hash = ${tokenHash}
      `
      return rows[0] ? mapCustomerAccessLink(rows[0]) : null
    },

    async revokeCustomerAccessLinksForCustomer(tenantId, customerId, at) {
      await sql`
        update customer_access_links
        set revoked_at = ${at}
        where tenant_id = ${tenantId} and customer_id = ${customerId} and revoked_at is null
      `
    },
  }
}
