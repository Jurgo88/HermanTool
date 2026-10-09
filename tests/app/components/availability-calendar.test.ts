import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AvailabilityCalendar, {
  type CalendarDay,
  type CalendarMonth,
} from '~/components/AvailabilityCalendar.vue'
import { sk } from '~/i18n/sk'

// C-21 (D-58, D-47, D-51). The component renders the server's month and does
// no date arithmetic; what it owns is which days can be picked, that derived
// levels are worded (never colour alone, §8), and how a range is painted.
const day = (n: number, level: CalendarDay['level'], selectable = true): CalendarDay => ({
  day: `2026-10-${String(n).padStart(2, '0')}`,
  weekday: ((n + 2) % 7) + 1, // 1 October 2026 is a Thursday (4)
  selectable,
  level,
})

const month: CalendarMonth = {
  month: '2026-10',
  previousMonth: null,
  nextMonth: '2026-11',
  days: [
    day(1, null, false), // past
    day(2, null, false), // past
    day(3, 'free'),
    day(4, 'last'),
    day(5, 'none'),
    day(6, 'free'),
  ],
}

const mountCalendar = (overrides: Record<string, unknown> = {}) =>
  mountSuspended(AvailabilityCalendar, {
    props: { month, status: 'loaded', startDay: null, endDay: null, ...overrides },
  })

const dayButton = (calendar: Awaited<ReturnType<typeof mountCalendar>>, n: number) =>
  calendar.findAll('button.availability-calendar__day')[n - 1]!

describe('AvailabilityCalendar (C-21, D-58)', () => {
  it('titles the month in Slovak and offsets the first day by the server-given weekday', async () => {
    const calendar = await mountCalendar()

    expect(calendar.find('h3').text()).toBe('október 2026')
    // Thursday: three blank cells (Mon-Wed) before day 1.
    expect(
      calendar.findAll('.availability-calendar__grid > span[aria-hidden="true"]'),
    ).toHaveLength(3)
  })

  it('words the derived levels instead of relying on colour', async () => {
    const calendar = await mountCalendar()

    expect(dayButton(calendar, 4).text()).toContain(sk.availabilityCalendar.levelLast)
    expect(dayButton(calendar, 5).text()).toContain(sk.availabilityCalendar.levelNone)
    expect(dayButton(calendar, 3).text()).not.toContain(sk.availabilityCalendar.levelFree)
    // The accessible name carries the date and the level for a screen reader.
    expect(dayButton(calendar, 5).attributes('aria-label')).toContain(
      sk.availabilityCalendar.levelNone,
    )
  })

  it('lets only free and last days be picked', async () => {
    const calendar = await mountCalendar()

    expect(dayButton(calendar, 1).attributes('disabled')).toBeDefined() // past
    expect(dayButton(calendar, 5).attributes('disabled')).toBeDefined() // none
    expect(dayButton(calendar, 3).attributes('disabled')).toBeUndefined()
    expect(dayButton(calendar, 4).attributes('disabled')).toBeUndefined()
  })

  it('emits the ISO day of a picked day, and nothing for a disabled one', async () => {
    const calendar = await mountCalendar()

    await dayButton(calendar, 4).trigger('click')
    await dayButton(calendar, 5).trigger('click')

    expect(calendar.emitted('pick')).toEqual([['2026-10-04']])
  })

  it('marks a one-day selection and a range with aria-pressed', async () => {
    const single = await mountCalendar({ startDay: '2026-10-03', endDay: null })
    expect(single.findAll('button[aria-pressed="true"]')).toHaveLength(1)

    const range = await mountCalendar({ startDay: '2026-10-03', endDay: '2026-10-06' })
    const pressed = range
      .findAll('button.availability-calendar__day')
      .map((b) => b.attributes('aria-pressed'))
    expect(pressed).toEqual(['false', 'false', 'true', 'true', 'true', 'true'])
  })

  it('navigates by the months the server named, and has no way back into the past', async () => {
    const calendar = await mountCalendar()
    const [previous, next] = calendar.findAll('button.availability-calendar__nav')

    expect(previous!.attributes('disabled')).toBeDefined()
    await next!.trigger('click')
    expect(calendar.emitted('navigate')).toEqual([['2026-11']])

    const later = await mountCalendar({
      month: { ...month, month: '2026-11', previousMonth: '2026-10' },
    })
    const [back] = later.findAll('button.availability-calendar__nav')
    await back!.trigger('click')
    expect(later.emitted('navigate')).toEqual([['2026-10']])
  })

  it('reports a load error with Slovak copy', async () => {
    const calendar = await mountCalendar({ month: null, status: 'error' })

    expect(calendar.text()).toContain(sk.availabilityCalendar.loadError)
  })
})
