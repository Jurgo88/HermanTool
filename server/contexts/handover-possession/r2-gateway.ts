// The storage anti-corruption layer for ConditionReport photographs
// (D-27: the `conditions` bucket — backed up, unlike Customer Identity &
// Compliance's `evidence` bucket, since it is ordinary rental-history
// evidence rather than the highest-severity personal data in the
// system). This is the ONLY file in Handover & Possession allowed to
// import the AWS S3 SDK. Mirrors
// server/contexts/customer-identity-compliance/r2-gateway.ts's shape
// deliberately — same storage mechanism, different bucket, different
// owning context (D-02: each context owns its own ACL to its own data,
// even when the pattern is identical).
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const UPLOAD_URL_TTL_SECONDS = 5 * 60
const READ_URL_TTL_SECONDS = 5 * 60

export interface ConditionReportStorageGateway {
  generateUploadUrl(objectKey: string, contentType: string): Promise<{ uploadUrl: string; expiresAt: Date }>
  generateReadUrl(objectKey: string): Promise<{ readUrl: string; expiresAt: Date }>
}

export function createR2ConditionReportGateway(params: {
  accessKeyId: string
  secretAccessKey: string
  endpoint: string
  bucket: string
}): ConditionReportStorageGateway {
  const { accessKeyId, secretAccessKey, endpoint, bucket } = params
  const client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  })

  return {
    async generateUploadUrl(objectKey, contentType) {
      const command = new PutObjectCommand({ Bucket: bucket, Key: objectKey, ContentType: contentType })
      const uploadUrl = await getSignedUrl(client, command, { expiresIn: UPLOAD_URL_TTL_SECONDS })
      return { uploadUrl, expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000) }
    },

    async generateReadUrl(objectKey) {
      const command = new GetObjectCommand({ Bucket: bucket, Key: objectKey })
      const readUrl = await getSignedUrl(client, command, { expiresIn: READ_URL_TTL_SECONDS })
      return { readUrl, expiresAt: new Date(Date.now() + READ_URL_TTL_SECONDS * 1000) }
    },
  }
}
