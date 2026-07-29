// In-memory stand-in for IdentityEvidenceStorageGateway
// (server/contexts/customer-identity-compliance/r2-gateway.ts) — proves
// ./identity-evidence.ts against the ACL's interface without calling R2.
// Deliberately never imports the AWS S3 SDK, same as the real gateway's
// callers never see an S3-shaped type.
import type { IdentityEvidenceStorageGateway } from '../../../../server/contexts/customer-identity-compliance/r2-gateway'

export interface FakeIdentityEvidenceStorageGateway extends IdentityEvidenceStorageGateway {
  uploadUrlCalls: { objectKey: string; contentType: string }[]
  readUrlCalls: string[]
  deletedObjectKeys: string[]
}

export function createFakeIdentityEvidenceStorageGateway(): FakeIdentityEvidenceStorageGateway {
  const uploadUrlCalls: { objectKey: string; contentType: string }[] = []
  const readUrlCalls: string[] = []
  const deletedObjectKeys: string[] = []

  return {
    uploadUrlCalls,
    readUrlCalls,
    deletedObjectKeys,

    async generateUploadUrl(objectKey, contentType) {
      uploadUrlCalls.push({ objectKey, contentType })
      return { uploadUrl: `https://r2.test/upload/${objectKey}`, expiresAt: new Date(Date.now() + 300_000) }
    },

    async generateReadUrl(objectKey) {
      readUrlCalls.push(objectKey)
      return { readUrl: `https://r2.test/read/${objectKey}`, expiresAt: new Date(Date.now() + 300_000) }
    },

    async deleteObject(objectKey) {
      deletedObjectKeys.push(objectKey)
    },
  }
}
