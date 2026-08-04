// Asset Registry's data access, kept behind a narrow interface so the
// domain logic in ./asset-lifecycle.ts is testable without a database
// (Part 4 §14.2 — "domain logic sits in ordinary TypeScript that is
// testable locally without a database"). Every method takes `tenantId`
// as its first parameter: this is FR-33's tenant-scoping invariant made
// structural rather than a convention a caller could forget.
import type postgres from 'postgres'
import type { TenantId } from '../_shared'
import type { Asset, AssetStatus, AssetStatusEvent, AssetTag } from './types'

export interface NewAssetStatusEvent {
  assetId: number
  fromStatus: AssetStatus | null
  toStatus: AssetStatus
  reason: string | null
  operatorId: string
}

export interface AssetRegistryRepository {
  assetTypeExists(tenantId: TenantId, assetTypeId: number): Promise<boolean>

  // The literal count of Assets currently in `rentable` status — units
  // sitting on the shelf right now. Deliberately NOT the capacity bound
  // used by Availability & Reservation (see getRentablePoolCount below):
  // this is what FR-29's shortfall ranking needs (Part 5 Finding 12,
  // server/utils/overdue-noshow-views.ts) — "will confirmed demand
  // exceed what is physically on the shelf", which is a different
  // question from "what is this AssetType's booking capacity" (D-38).
  getRentableCount(tenantId: TenantId, assetTypeId: number): Promise<number>

  // Availability & Reservation's D-33 holds mechanism reads this as the
  // capacity bound for its per-(AssetType, day) atomic hold increment —
  // it must be called with a repository bound to that same transaction
  // (see this factory's `sql` parameter) so the capacity read and the
  // hold increment share one transaction (Part 4 §16 D-33). This is the
  // published-interface seam D-02 requires: Availability & Reservation
  // calls this method, never `select ... from assets` directly.
  //
  // D-38 (Part 4 §16.2, raised by IR-01): capacity is the size of the
  // rentable POOL — Rentable + InPossession + UnderInspection — not the
  // count of Assets currently in Rentable status. An Asset out on
  // HandoverOut has already had its days held by its own Reservation;
  // subtracting it from `rentable` a second time here would reduce
  // capacity for every OTHER day too, which is the bug D-38 fixes.
  // Unavailable and Retired are excluded: those statuses are statements
  // that a unit has left the pool, not statements about where it stands
  // today.
  getRentablePoolCount(tenantId: TenantId, assetTypeId: number): Promise<number>

  getAsset(tenantId: TenantId, assetId: number): Promise<Asset | null>

  insertAsset(
    tenantId: TenantId,
    params: { assetTypeId: number; status: AssetStatus; operatorId: string },
  ): Promise<Asset>

  updateAssetStatus(
    tenantId: TenantId,
    assetId: number,
    params: { status: AssetStatus; operatorId: string; reason: string | null },
  ): Promise<Asset>

  insertStatusEvent(tenantId: TenantId, event: NewAssetStatusEvent): Promise<AssetStatusEvent>

  getActiveTagForAsset(tenantId: TenantId, assetId: number): Promise<AssetTag | null>

  getActiveTagBinding(tenantId: TenantId, tagCode: string): Promise<AssetTag | null>

  insertAssetTag(
    tenantId: TenantId,
    params: { assetId: number; tagCode: string; operatorId: string },
  ): Promise<AssetTag>

  unbindAssetTag(tenantId: TenantId, tagId: number, operatorId: string): Promise<void>

  // F10, FR-25, FR-26; issue #9: the next value from a dedicated,
  // tag-only identity space (asset_tag_code_seq) — deliberately NOT the
  // Asset's own id or the asset_tags row's own id, so a tag code never
  // correlates with either (Finding 10: "never an Asset ID"). Every call
  // consumes a value permanently, matching a physical QR sticker that,
  // once printed, is never reissued to a different tag even if this
  // particular bulk-registration attempt is rolled back — cheap and
  // correct at this scale (NFR-04), same "a gap in a serial column is
  // fine" reasoning Postgres sequences always carry.
  nextTagCodeNumber(tenantId: TenantId): Promise<number>

  // Runs `fn` against a repository bound to a single transaction, so a
  // multi-step domain operation (e.g. rebind = unbind + insert) commits or
  // rolls back as one unit.
  transaction<T>(fn: (repo: AssetRegistryRepository) => Promise<T>): Promise<T>
}

interface AssetRow {
  id: number
  tenant_id: string
  asset_type_id: number
  status: AssetStatus
  registered_at: Date
  registered_by_operator_id: string
  status_changed_at: Date
  status_changed_by_operator_id: string
  status_change_reason: string | null
}

function mapAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    tenantId: row.tenant_id as TenantId,
    assetTypeId: row.asset_type_id,
    status: row.status,
    registeredAt: row.registered_at,
    registeredByOperatorId: row.registered_by_operator_id,
    statusChangedAt: row.status_changed_at,
    statusChangedByOperatorId: row.status_changed_by_operator_id,
    statusChangeReason: row.status_change_reason,
  }
}

interface AssetStatusEventRow {
  id: number
  tenant_id: string
  asset_id: number
  from_status: AssetStatus | null
  to_status: AssetStatus
  reason: string | null
  occurred_at: Date
  recorded_at: Date
  operator_id: string
}

function mapStatusEvent(row: AssetStatusEventRow): AssetStatusEvent {
  return {
    id: row.id,
    tenantId: row.tenant_id as TenantId,
    assetId: row.asset_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    reason: row.reason,
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
    operatorId: row.operator_id,
  }
}

interface AssetTagRow {
  id: number
  tenant_id: string
  asset_id: number
  tag_code: string
  bound_at: Date
  bound_by_operator_id: string
  unbound_at: Date | null
  unbound_by_operator_id: string | null
}

function mapAssetTag(row: AssetTagRow): AssetTag {
  return {
    id: row.id,
    tenantId: row.tenant_id as TenantId,
    assetId: row.asset_id,
    tagCode: row.tag_code,
    boundAt: row.bound_at,
    boundByOperatorId: row.bound_by_operator_id,
    unboundAt: row.unbound_at,
    unboundByOperatorId: row.unbound_by_operator_id,
  }
}

export function createPostgresAssetRegistryRepository(
  sql: postgres.Sql | postgres.TransactionSql,
): AssetRegistryRepository {
  return {
    async assetTypeExists(tenantId, assetTypeId) {
      const rows = await sql<
        { id: number }[]
      >`select id from asset_types where tenant_id = ${tenantId} and id = ${assetTypeId}`
      return rows.length > 0
    },

    async getRentableCount(tenantId, assetTypeId) {
      const rows = await sql<{ count: string }[]>`
        select count(*)::text as count from assets
        where tenant_id = ${tenantId} and asset_type_id = ${assetTypeId} and status = 'rentable'
      `
      return Number(rows[0]!.count)
    },

    async getRentablePoolCount(tenantId, assetTypeId) {
      const rows = await sql<{ count: string }[]>`
        select count(*)::text as count from assets
        where tenant_id = ${tenantId} and asset_type_id = ${assetTypeId}
          and status in ('rentable', 'in_possession', 'under_inspection')
      `
      return Number(rows[0]!.count)
    },

    async getAsset(tenantId, assetId) {
      const rows = await sql<
        AssetRow[]
      >`select * from assets where tenant_id = ${tenantId} and id = ${assetId}`
      return rows[0] ? mapAsset(rows[0]) : null
    },

    async insertAsset(tenantId, { assetTypeId, status, operatorId }) {
      const rows = await sql<AssetRow[]>`
        insert into assets (
          tenant_id, asset_type_id, status,
          registered_by_operator_id, status_changed_by_operator_id
        ) values (
          ${tenantId}, ${assetTypeId}, ${status},
          ${operatorId}, ${operatorId}
        )
        returning *
      `
      return mapAsset(rows[0]!)
    },

    async updateAssetStatus(tenantId, assetId, { status, operatorId, reason }) {
      const rows = await sql<AssetRow[]>`
        update assets
        set status = ${status},
            status_changed_at = now(),
            status_changed_by_operator_id = ${operatorId},
            status_change_reason = ${reason}
        where tenant_id = ${tenantId} and id = ${assetId}
        returning *
      `
      return mapAsset(rows[0]!)
    },

    async insertStatusEvent(tenantId, event) {
      const rows = await sql<AssetStatusEventRow[]>`
        insert into asset_status_events (
          tenant_id, asset_id, from_status, to_status, reason, operator_id
        ) values (
          ${tenantId}, ${event.assetId}, ${event.fromStatus}, ${event.toStatus},
          ${event.reason}, ${event.operatorId}
        )
        returning *
      `
      return mapStatusEvent(rows[0]!)
    },

    async getActiveTagForAsset(tenantId, assetId) {
      const rows = await sql<AssetTagRow[]>`
        select * from asset_tags
        where tenant_id = ${tenantId} and asset_id = ${assetId} and unbound_at is null
      `
      return rows[0] ? mapAssetTag(rows[0]) : null
    },

    async getActiveTagBinding(tenantId, tagCode) {
      const rows = await sql<AssetTagRow[]>`
        select * from asset_tags
        where tenant_id = ${tenantId} and tag_code = ${tagCode} and unbound_at is null
      `
      return rows[0] ? mapAssetTag(rows[0]) : null
    },

    async insertAssetTag(tenantId, { assetId, tagCode, operatorId }) {
      const rows = await sql<AssetTagRow[]>`
        insert into asset_tags (tenant_id, asset_id, tag_code, bound_by_operator_id)
        values (${tenantId}, ${assetId}, ${tagCode}, ${operatorId})
        returning *
      `
      return mapAssetTag(rows[0]!)
    },

    async unbindAssetTag(tenantId, tagId, operatorId) {
      await sql`
        update asset_tags
        set unbound_at = now(), unbound_by_operator_id = ${operatorId}
        where tenant_id = ${tenantId} and id = ${tagId} and unbound_at is null
      `
    },

    // Single global sequence for the pilot's one Tenant (D-01) —
    // `tenantId` isn't used in the query itself, kept in the signature
    // for FR-33's structural consistency ("every method takes tenantId
    // first") and so a second Tenant's own partitioning is a one-line
    // change here, not a signature change at every call site.
    async nextTagCodeNumber(_tenantId) {
      const rows = await sql<{ n: number }[]>`select nextval('asset_tag_code_seq')::int as n`
      return rows[0]!.n
    },

    async transaction<T>(fn: (repo: AssetRegistryRepository) => Promise<T>) {
      // `sql` is typed `postgres.Sql | postgres.TransactionSql` because
      // this same factory recursively constructs a repo bound to `trx`
      // inside the callback below — but `TransactionSql` has no
      // `.begin()` (nested transactions use `savepoint()` instead;
      // postgres.js's own types reflect this). Nothing in this codebase
      // calls `.transaction()` on an already-transaction-bound repo, so
      // this is unreachable in practice, but the guard makes that a
      // checked invariant instead of a silent `sql.begin is not a
      // function` at runtime.
      if (!('begin' in sql)) {
        throw new Error('Nested transactions are not supported — this repository is already bound to one.')
      }
      // postgres.js's begin<T> returns Promise<UnwrapPromiseArray<T>> —
      // its own utility type for the case where T is itself an array of
      // promises. Our callback always returns a plain value (never an
      // array), so UnwrapPromiseArray<T> and T are the same type in
      // every actual use here; TypeScript just can't prove that for an
      // arbitrary generic T, hence the explicit assertion rather than a
      // structural mismatch TypeScript would otherwise (correctly, in
      // general) refuse.
      return sql.begin((trx) => fn(createPostgresAssetRegistryRepository(trx))) as Promise<T>
    },
  }
}
