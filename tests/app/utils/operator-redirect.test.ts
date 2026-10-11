import { describe, expect, it } from 'vitest'
import {
  loginLocation,
  OPERATOR_HOME,
  safeOperatorRedirect,
} from '../../../app/utils/operator-redirect'

// S-18: the `redirect` query comes from the address bar, so a link someone
// sends an Operator must never be able to take them to another site after
// they have typed their password.
describe('safeOperatorRedirect', () => {
  it('honours a path inside /admin, query and all', () => {
    expect(safeOperatorRedirect('/admin/catalog')).toBe('/admin/catalog')
    expect(safeOperatorRedirect('/admin/counter/assets/12?tab=history')).toBe(
      '/admin/counter/assets/12?tab=history',
    )
    expect(safeOperatorRedirect('/admin')).toBe('/admin')
  })

  it('falls back to the counter for anything missing or not a string', () => {
    for (const raw of [undefined, null, '', 42, ['/admin/catalog'], {}]) {
      expect(safeOperatorRedirect(raw)).toBe(OPERATOR_HOME)
    }
  })

  it('refuses another site, however it is written', () => {
    for (const raw of [
      'https://evil.example/admin/x',
      '//evil.example',
      '/\\evil.example',
      '/admin//evil.example',
      '/admin/\\evil.example',
      'javascript:alert(1)',
      '/login',
      '/',
      '/administrator',
      '/admin/../etc',
      '/admin/x\n/y',
    ]) {
      expect(safeOperatorRedirect(raw), raw).toBe(OPERATOR_HOME)
    }
  })
})

describe('loginLocation', () => {
  it('carries the page the Operator was on, encoded', () => {
    expect(loginLocation('/admin/catalog')).toBe('/login?redirect=%2Fadmin%2Fcatalog')
    expect(loginLocation('/admin/counter/assets/12?tab=a&b=c')).toBe(
      '/login?redirect=%2Fadmin%2Fcounter%2Fassets%2F12%3Ftab%3Da%26b%3Dc',
    )
  })

  it('is plain /login when the page is not a place login may return to', () => {
    expect(loginLocation('/')).toBe('/login')
    expect(loginLocation('/naradie/3')).toBe('/login')
    expect(loginLocation('//evil.example')).toBe('/login')
  })
})
