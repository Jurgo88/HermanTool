import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AppAlert from '~/components/AppAlert.vue'
import { sk } from '~/i18n/sk'

// C-03 (D-43, D-50, UI-D-08). This is the example test UI-005 asks for, but it
// is not a smoke test: the rule it guards is the one the interface keeps
// breaking (UIF-03). AppAlert takes an error CODE and looks it up in sk.ts;
// English domain-error text must never reach a Slovak Operator, and an
// untranslated code must degrade to real copy rather than leak the identifier.

describe('AppAlert (C-03, D-50)', () => {
  it('renders the Operator register entry for a known code', async () => {
    const alert = await mountSuspended(AppAlert, {
      props: { code: 'TagAlreadyBoundError', audience: 'operator' },
    })

    expect(alert.text()).toContain(sk.errors.operator.TagAlreadyBoundError)
  })

  it('falls back to real copy for a code with no translation yet', async () => {
    const alert = await mountSuspended(AppAlert, {
      props: { code: 'SomeCodeNobodyHasTranslatedYet', audience: 'operator' },
    })

    expect(alert.text()).toContain(sk.common.somethingWentWrong)
  })

  it('never renders the raw code, translated or not', async () => {
    // The failure this catches: a fallback that helpfully shows the code.
    // `RetentionWindowNotConfiguredError` on screen is UIF-03 all over again.
    const alert = await mountSuspended(AppAlert, {
      props: { code: 'RetentionWindowNotConfiguredError', audience: 'operator' },
    })

    expect(alert.text()).not.toContain('RetentionWindowNotConfiguredError')
  })

  it('uses the Customer register when the audience is the Customer', async () => {
    // Two registers exist because the same fact is said differently to an
    // Operator and to a Customer; picking the wrong one is silent.
    const [code] = Object.keys(sk.errors.customer)
    const alert = await mountSuspended(AppAlert, {
      props: { code, audience: 'customer' },
    })

    expect(alert.text()).toContain(sk.errors.customer[code as keyof typeof sk.errors.customer])
  })
})
