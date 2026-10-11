<!-- C-21 (D-58, D-47, D-51; design foundation §5, S-02). Renders the
  server's month payload: weekdays, selectable days and a derived level
  per day. It does no date arithmetic. The only day comparison is the
  string order of ISO days to paint the selected range, and the only
  offset is the first day's weekday, which the server provides. Levels
  are derived facts, so they get the hatched/dotted derived treatment and
  a word, never a state chip and never colour alone (§8). -->
<script setup lang="ts">
import { sk } from '~/i18n/sk'
import { formatDay, formatDayOfMonth, formatMonth } from '~/utils/format'

export interface CalendarDay {
  day: string
  weekday: number
  selectable: boolean
  level: 'free' | 'last' | 'none' | null
}

export interface CalendarMonth {
  month: string
  previousMonth: string | null
  nextMonth: string
  days: CalendarDay[]
}

const props = defineProps<{
  month: CalendarMonth | null
  status: 'loading' | 'loaded' | 'error'
  startDay: string | null
  endDay: string | null
}>()

const emit = defineEmits<{ pick: [day: string]; navigate: [month: string] }>()

const leadingBlanks = computed(() => (props.month?.days[0]?.weekday ?? 1) - 1)

function isPickable(day: CalendarDay): boolean {
  return day.selectable && day.level !== 'none' && day.level !== null
}

function inRange(day: string): boolean {
  if (!props.startDay) return false
  const end = props.endDay ?? props.startDay
  return day >= props.startDay && day <= end
}

function levelLabel(day: CalendarDay): string {
  if (!day.selectable || day.level === null) return sk.availabilityCalendar.levelPast
  if (day.level === 'none') return sk.availabilityCalendar.levelNone
  if (day.level === 'last') return sk.availabilityCalendar.levelLast
  return sk.availabilityCalendar.levelFree
}
</script>

<template>
  <div class="availability-calendar">
    <div class="availability-calendar__header">
      <button
        type="button"
        class="availability-calendar__nav"
        :disabled="!month?.previousMonth"
        :aria-label="sk.availabilityCalendar.previousMonth"
        @click="month?.previousMonth && emit('navigate', month.previousMonth)"
      >
        <span aria-hidden="true">{{ sk.availabilityCalendar.previousGlyph }}</span>
      </button>
      <h3 class="availability-calendar__title" aria-live="polite">
        {{ month ? formatMonth(month.month) : '' }}
      </h3>
      <button
        type="button"
        class="availability-calendar__nav"
        :disabled="!month"
        :aria-label="sk.availabilityCalendar.nextMonth"
        @click="month && emit('navigate', month.nextMonth)"
      >
        <span aria-hidden="true">{{ sk.availabilityCalendar.nextGlyph }}</span>
      </button>
    </div>

    <p v-if="status === 'loading' && !month" aria-busy="true">
      {{ sk.availabilityCalendar.loading }}
    </p>
    <AppAlert v-else-if="status === 'error'" :message="sk.availabilityCalendar.loadError" />

    <div v-if="month" class="availability-calendar__grid" :aria-busy="status === 'loading'">
      <span
        v-for="weekday in sk.availabilityCalendar.weekdays"
        :key="weekday"
        class="availability-calendar__weekday"
      >
        {{ weekday }}
      </span>
      <span v-for="blank in leadingBlanks" :key="`blank-${blank}`" aria-hidden="true" />
      <button
        v-for="day in month.days"
        :key="day.day"
        type="button"
        class="availability-calendar__day"
        :class="[`availability-calendar__day--${day.selectable ? (day.level ?? 'past') : 'past'}`]"
        :disabled="!isPickable(day)"
        :aria-pressed="inRange(day.day)"
        :aria-label="`${formatDay(day.day)}, ${levelLabel(day)}`"
        @click="emit('pick', day.day)"
      >
        <span class="availability-calendar__number">{{ formatDayOfMonth(day.day) }}</span>
      </button>
    </div>

    <!-- The words live here, not in the cells: at phone width a cell is about
      48 px, too narrow for "obsadené" or "posledný kus". Each cell keeps the
      hatch or the dotted edge and the full word in its accessible name. -->
    <ul
      v-if="month"
      class="availability-calendar__legend"
      :aria-label="sk.availabilityCalendar.legendLabel"
    >
      <li>
        <span
          class="availability-calendar__swatch availability-calendar__swatch--last"
          aria-hidden="true"
        />
        {{ sk.availabilityCalendar.levelLast }}
      </li>
      <li>
        <span
          class="availability-calendar__swatch availability-calendar__swatch--none"
          aria-hidden="true"
        />
        {{ sk.availabilityCalendar.levelNone }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.availability-calendar {
  --ht-hatch: repeating-linear-gradient(
    135deg,
    var(--ht-surface-sunk) 0 var(--ht-space-1),
    var(--ht-surface) var(--ht-space-1) var(--ht-space-2)
  );

  display: flex;
  flex-direction: column;
  gap: var(--ht-space-3);
}

.availability-calendar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.availability-calendar__title {
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.availability-calendar__nav {
  min-width: var(--ht-hit-min);
  min-height: var(--ht-hit-min);
  border: 1px solid var(--ht-line-strong);
  border-radius: var(--ht-radius-card);
  background: var(--ht-surface);
  color: var(--ht-ink);
  font-size: var(--ht-text-4);
  cursor: pointer;
}

.availability-calendar__nav:disabled {
  color: var(--ht-line-strong);
  cursor: default;
}

.availability-calendar__grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: var(--ht-space-1);
}

.availability-calendar__weekday {
  text-align: center;
  font-family: var(--ht-font-condensed);
  font-size: var(--ht-text-1);
  text-transform: uppercase;
  color: var(--ht-ink-muted);
}

.availability-calendar__day {
  min-height: var(--ht-hit-min);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0;
  padding: var(--ht-space-1);
  border: 1px solid var(--ht-line);
  border-radius: var(--ht-radius-plate);
  background: var(--ht-surface);
  color: var(--ht-ink);
  cursor: pointer;
}

.availability-calendar__number {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.availability-calendar__legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ht-space-2) var(--ht-space-4);
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: var(--ht-text-2);
  color: var(--ht-ink-muted);
}

.availability-calendar__legend li {
  display: inline-flex;
  align-items: center;
  gap: var(--ht-space-2);
}

.availability-calendar__swatch {
  width: var(--ht-space-5);
  height: var(--ht-space-5);
  border: 1px solid var(--ht-line);
  border-radius: var(--ht-radius-plate);
  background: var(--ht-surface);
}

.availability-calendar__swatch--last {
  border: 2px dotted var(--ht-warn);
}

.availability-calendar__swatch--none {
  background: var(--ht-hatch);
}

/* Derived: one unit left — dotted edge (explained in the legend). */
.availability-calendar__day--last {
  border: 2px dotted var(--ht-warn);
}

/* Derived: nothing free — hatched (explained in the legend). */
.availability-calendar__day--none {
  background: var(--ht-hatch);
  color: var(--ht-ink-muted);
  cursor: not-allowed;
}

.availability-calendar__day--past {
  background: transparent;
  border-color: transparent;
  color: var(--ht-line-strong);
  cursor: default;
}

.availability-calendar__day[aria-pressed='true'] {
  background: var(--ht-brand);
  border-color: var(--ht-brand-deep);
  color: var(--ht-on-brand);
}

.availability-calendar__day:focus-visible,
.availability-calendar__nav:focus-visible {
  outline: 3px solid var(--ht-signal-deep);
  outline-offset: 2px;
}
</style>
