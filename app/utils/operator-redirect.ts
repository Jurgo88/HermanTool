// Where an Operator lands after signing in (S-18, S-23). A page that finds the
// session gone sends the Operator to /login with the page they were on, and
// login returns them there, so an expired session costs a password and not
// the place they were working.
//
// The target comes from the address bar, so it is untrusted: only a path
// inside /admin is honoured. Anything else (another site, a protocol-relative
// `//host`, a backslash trick, a control character, `..`) falls back to the
// default rather than becoming an open redirect.

// The counter is the high-frequency destination (S-08, and the Operator
// application's start URL); the owner reaches the catalog from the bar.
export const OPERATOR_HOME = '/admin/counter'

export function safeOperatorRedirect(raw: unknown): string {
  if (typeof raw !== 'string') return OPERATOR_HOME
  if (raw !== '/admin' && !raw.startsWith('/admin/')) return OPERATOR_HOME
  if (raw.includes('//') || raw.includes('\\') || raw.includes('..')) return OPERATOR_HOME
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw)) return OPERATOR_HOME
  return raw
}

// `fullPath` is the page that found the session gone. When it is not a place
// login could safely return to, plain /login.
export function loginLocation(fullPath: string): string {
  const target = safeOperatorRedirect(fullPath)
  return target === fullPath ? `/login?redirect=${encodeURIComponent(fullPath)}` : '/login'
}
