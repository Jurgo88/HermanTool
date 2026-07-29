import { describe, expect, it } from 'vitest'
import type { TenantId } from '../../../server/contexts/_shared'
import { InvalidPinError, PinTooShortError, setOperatorPin, verifyOperatorPin } from '../../../server/utils/operator-pin'
import { createFakeOperatorRepository, fakeOperator } from './fake-auth-deps'

const tenantA = '11111111-1111-1111-1111-111111111111' as TenantId
const tenantB = '99999999-9999-9999-9999-999999999999' as TenantId

describe('setOperatorPin / verifyOperatorPin', () => {
  it('resolves the correct Operator after their PIN is set (F8, Finding 8)', async () => {
    const owner = fakeOperator({ id: 'owner-1', tenantId: tenantA, displayName: 'Majsterko' })
    const repo = createFakeOperatorRepository([owner])

    await setOperatorPin(repo, owner.id, '1234')
    const resolved = await verifyOperatorPin(repo, tenantA, '1234')

    expect(resolved.id).toBe(owner.id)
  })

  it('resolves WHICHEVER Operator the PIN belongs to, independent of who else shares the Tenant (the shared-counter-phone case)', async () => {
    const owner = fakeOperator({ id: 'owner-1', tenantId: tenantA, displayName: 'Majsterko' })
    const employee = fakeOperator({ id: 'employee-1', tenantId: tenantA, displayName: 'Pokladník' })
    const repo = createFakeOperatorRepository([owner, employee])

    await setOperatorPin(repo, owner.id, '1111')
    await setOperatorPin(repo, employee.id, '2222')

    // Whichever Operator's session cookie happens to be live on the
    // shared phone, THIS PIN resolves to the employee specifically.
    const resolved = await verifyOperatorPin(repo, tenantA, '2222')

    expect(resolved.id).toBe(employee.id)
    expect(resolved.id).not.toBe(owner.id)
  })

  it('refuses a PIN that matches no Operator', async () => {
    const owner = fakeOperator({ id: 'owner-1', tenantId: tenantA })
    const repo = createFakeOperatorRepository([owner])
    await setOperatorPin(repo, owner.id, '1234')

    await expect(verifyOperatorPin(repo, tenantA, '9999')).rejects.toThrow(InvalidPinError)
  })

  it('refuses before any Operator has set a PIN', async () => {
    const owner = fakeOperator({ id: 'owner-1', tenantId: tenantA })
    const repo = createFakeOperatorRepository([owner])

    await expect(verifyOperatorPin(repo, tenantA, '1234')).rejects.toThrow(InvalidPinError)
  })

  it('never resolves a PIN across Tenants (FR-33)', async () => {
    const ownerA = fakeOperator({ id: 'owner-a', tenantId: tenantA })
    const ownerB = fakeOperator({ id: 'owner-b', tenantId: tenantB })
    const repo = createFakeOperatorRepository([ownerA, ownerB])

    await setOperatorPin(repo, ownerA.id, '1234')
    await setOperatorPin(repo, ownerB.id, '1234')

    const resolved = await verifyOperatorPin(repo, tenantB, '1234')
    expect(resolved.id).toBe(ownerB.id)
  })

  it('refuses a PIN shorter than the minimum length', async () => {
    const owner = fakeOperator({ id: 'owner-1', tenantId: tenantA })
    const repo = createFakeOperatorRepository([owner])

    await expect(setOperatorPin(repo, owner.id, '12')).rejects.toThrow(PinTooShortError)
  })
})
