// In-memory stand-in for ConditionReportStorageGateway
// (server/contexts/handover-possession/r2-gateway.ts) — proves
// ./handover-out.ts against the ACL's interface without calling R2.
import type {
  ConditionReportStorageGateway,
  ObjectStat,
} from '../../../../server/contexts/handover-possession/r2-gateway'

export interface FakeConditionReportStorageGateway extends ConditionReportStorageGateway {
  uploadUrlCalls: { objectKey: string; contentType: string }[]
  deletedObjectKeys: string[]
  statCalls: string[]
  // Test control (D-40): defaults to "does not exist" for any key never
  // set explicitly, same reasoning as the IdentityEvidence fake.
  objectStats: Map<string, ObjectStat>
}

export function createFakeConditionReportStorageGateway(): FakeConditionReportStorageGateway {
  const uploadUrlCalls: { objectKey: string; contentType: string }[] = []
  const deletedObjectKeys: string[] = []
  const statCalls: string[] = []
  const objectStats = new Map<string, ObjectStat>()

  return {
    uploadUrlCalls,
    deletedObjectKeys,
    statCalls,
    objectStats,

    async generateUploadUrl(objectKey, contentType) {
      uploadUrlCalls.push({ objectKey, contentType })
      return { uploadUrl: `https://r2.test/conditions/upload/${objectKey}`, expiresAt: new Date(Date.now() + 300_000) }
    },

    async generateReadUrl(objectKey) {
      return { readUrl: `https://r2.test/conditions/read/${objectKey}`, expiresAt: new Date(Date.now() + 300_000) }
    },

    async statObject(objectKey) {
      statCalls.push(objectKey)
      return objectStats.get(objectKey) ?? { exists: false, contentLength: null }
    },

    async deleteObject(objectKey) {
      deletedObjectKeys.push(objectKey)
    },
  }
}
