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
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// Exported so the D-40 sweep
// (./condition-report-confirmation.ts's sweepUnconfirmedConditionReports)
// can use "the presigned URL's own lifetime" as its cutoff without a
// second, driftable copy of this value.
export const UPLOAD_URL_TTL_SECONDS = 5 * 60
const READ_URL_TTL_SECONDS = 5 * 60

export interface ObjectStat {
  exists: boolean
  contentLength: number | null
}

export interface ConditionReportStorageGateway {
  generateUploadUrl(objectKey: string, contentType: string): Promise<{ uploadUrl: string; expiresAt: Date }>
  generateReadUrl(objectKey: string): Promise<{ readUrl: string; expiresAt: Date }>
  // D-40: the confirmation primitive — a single HEAD against the bucket
  // the platform controls. contentLength is null when exists is false;
  // never guessed.
  statObject(objectKey: string): Promise<ObjectStat>
  deleteObject(objectKey: string): Promise<void>
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

    async statObject(objectKey) {
      try {
        const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }))
        return { exists: true, contentLength: result.ContentLength ?? null }
      } catch (err) {
        // NotFound is the one expected outcome of "the upload never
        // happened" (D-40) — everything else (network, credentials, a
        // genuinely broken bucket) must surface as a real error rather
        // than being silently read as "unconfirmed."
        if (err instanceof NotFound) return { exists: false, contentLength: null }
        throw err
      }
    },

    async deleteObject(objectKey) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }))
    },
  }
}
