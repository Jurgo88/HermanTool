// D-50: extracts the stable `code` a translate*Error function attached to
// createError's `data` field (see server/utils/*-deps.ts). Returns null
// for a network failure, an already-handled 401 (redirect to /login), or
// any error that never went through a translate*Error call — AppAlert's
// own fallback (common.somethingWentWrong) covers that case.
//
// #176: h3 serialises the error as { statusCode, statusMessage, data }
// and $fetch puts that whole body on FetchError.data, so the code is one
// level down. The shallow read stays for an error object thrown directly.
export function getErrorCode(err: unknown): string | null {
  const data = (err as { data?: { code?: unknown; data?: { code?: unknown } } })?.data
  const code = data?.data?.code ?? data?.code
  return typeof code === 'string' ? code : null
}
