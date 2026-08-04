// D-40's "second, smaller obligation" (Part 4 §16.2, issue #78/IR-10):
// presigned uploads are size-bounded. OQ #26 ("maximum accepted
// photograph size for presigned uploads, for both buckets") is unset —
// 20 MB is a placeholder, generous for a phone camera photograph
// (typically 2-8 MB even uncompressed), same PENDING_EXPIRY_MINUTES-style
// framing as availability-reservation/reservation.ts's own placeholder:
// named, documented, and MUST be reconciled with an actual value before
// launch, not treated as a real decision.
//
// Enforced where confirmIdentityEvidenceUpload/confirmConditionReportUpload
// already do their one HEAD check (D-40's own reasoning: "the one place
// where the claim is cheap to check against the world it describes"),
// not via a presigned-PUT content-length range — S3-compatible presigned
// PUT only enforces an exact signed Content-Length, not a range, and
// nothing here knows the client's actual file size in advance. Checking
// after upload, at the same HEAD, extends the identical "declining to
// look is the failure" reasoning to size rather than mere existence.
export const MAX_EVIDENCE_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024
