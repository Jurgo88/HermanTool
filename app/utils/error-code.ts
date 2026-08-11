// D-50: extracts the stable `code` a translate*Error function attached to
// createError's `data` field (see server/utils/*-deps.ts). Returns null
// for a network failure, an already-handled 401 (redirect to /login), or
// any error that never went through a translate*Error call — AppAlert's
// own fallback (common.somethingWentWrong) covers that case.
export function getErrorCode(err: unknown): string | null {
  const data = (err as { data?: { code?: string } })?.data
  return typeof data?.code === 'string' ? data.code : null
}
