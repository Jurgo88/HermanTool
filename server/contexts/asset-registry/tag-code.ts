// AssetTag code generation (F10, FR-26; issue #9). "The QR must encode
// an opaque tag identity, never an Asset ID and never a URL bound to
// today's domain — the tag must outlive both the record and the domain"
// (Finding 10). A short, human-readable code — legible when a QR is
// scratched or a scanner is unavailable — rather than a long opaque
// token: this identity has no security purpose (unlike D-23's Customer
// access token), it only needs to be durable and non-correlating, and a
// human occasionally has to read one aloud over the phone.
const CODE_PREFIX = 'HT-'
const CODE_DIGITS = 6

// `n` comes from ./repository.ts's nextTagCodeNumber — its own dedicated
// sequence (asset_tag_code_seq), never assets.id or asset_tags.id.
export function formatTagCode(n: number): string {
  return `${CODE_PREFIX}${String(n).padStart(CODE_DIGITS, '0')}`
}
