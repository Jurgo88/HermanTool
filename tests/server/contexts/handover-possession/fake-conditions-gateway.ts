// In-memory stand-in for ConditionReportStorageGateway
// (server/contexts/handover-possession/r2-gateway.ts) — proves
// ./handover-out.ts against the ACL's interface without calling R2.
import type { ConditionReportStorageGateway } from '../../../../server/contexts/handover-possession/r2-gateway'

export interface FakeConditionReportStorageGateway extends ConditionReportStorageGateway {
  uploadUrlCalls: { objectKey: string; contentType: string }[]
}

export function createFakeConditionReportStorageGateway(): FakeConditionReportStorageGateway {
  const uploadUrlCalls: { objectKey: string; contentType: string }[] = []

  return {
    uploadUrlCalls,

    async generateUploadUrl(objectKey, contentType) {
      uploadUrlCalls.push({ objectKey, contentType })
      return { uploadUrl: `https://r2.test/conditions/upload/${objectKey}`, expiresAt: new Date(Date.now() + 300_000) }
    },

    async generateReadUrl(objectKey) {
      return { readUrl: `https://r2.test/conditions/read/${objectKey}`, expiresAt: new Date(Date.now() + 300_000) }
    },
  }
}
