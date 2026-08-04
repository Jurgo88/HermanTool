// The storage anti-corruption layer (D-27, NFR-06). This is the ONLY
// file in the codebase allowed to import the AWS S3 SDK — R2 is
// S3-compatible (D-27), and every export here speaks in this context's
// own vocabulary (an opaque objectKey, a URL, an expiry) so that nothing
// downstream needs to know it is R2, or S3-shaped, at all.
//
// NFR-06: the `evidence` bucket is never publicly addressable — every
// URL this gateway hands out is short-lived and single-purpose (an
// upload URL for one object, a read URL for one object), never a
// standing credential.
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// Exported so the D-40 sweep (./identity-evidence.ts's
// sweepUnconfirmedIdentityEvidence) can use "the presigned URL's own
// lifetime" as its cutoff without a second, driftable copy of this value.
export const UPLOAD_URL_TTL_SECONDS = 5 * 60
const READ_URL_TTL_SECONDS = 5 * 60

export interface ObjectStat {
  exists: boolean
  contentLength: number | null
}

export interface IdentityEvidenceStorageGateway {
  generateUploadUrl(objectKey: string, contentType: string): Promise<{ uploadUrl: string; expiresAt: Date }>
  generateReadUrl(objectKey: string): Promise<{ readUrl: string; expiresAt: Date }>
  // D-40: the confirmation primitive — a single HEAD against the bucket
  // the platform controls. contentLength is null when exists is false;
  // never guessed.
  statObject(objectKey: string): Promise<ObjectStat>
  deleteObject(objectKey: string): Promise<void>
}

export function createR2IdentityEvidenceGateway(params: {
  accessKeyId: string
  secretAccessKey: string
  endpoint: string
  bucket: string
}): IdentityEvidenceStorageGateway {
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
      // F8/NFR-06: the counter phone is shared, and mobile browsers cache
      // fetched images by default — a leaked/forwarded read URL must not
      // leave a cached passport photo sitting in the shared device's
      // browser cache after the tab closes. ResponseCacheControl
      // overrides the response header for THIS presigned request only;
      // it does not touch the object's own stored metadata.
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        ResponseCacheControl: 'no-store',
      })
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
