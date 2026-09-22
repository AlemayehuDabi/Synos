import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { CalendarEvent, CalendarEventException } from '../../src/generated/prisma/client.js';
import {
  assertRRulePossible,
  computeSeriesUntil,
  expandEvent,
  isNaturalOccurrence,
  naturalOccurrenceEnd,
} from '../../src/calendar/recurrence/occurrence-expander.js';

let counter = 0;
function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  counter += 1;
  return {
    id: `evt-${counter}`,
    userId: 'user-1',
    title: 'Event',
    notes: null,
    location: null,
    color: null,
    allDay: false,
    startsAt: new Date('2026-01-05T14:00:00Z'), // Mon 09:00 America/New_York
    endsAt: new Date('2026-01-05T15:00:00Z'),
    timezone: 'America/New_York',
    rrule: null,
    seriesUntil: null,
    source: 'manual',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function exception(eventId: string, overrides: Partial<CalendarEventException> = {}): CalendarEventException {
  return {
    id: `exc-${Math.random()}`,
    eventId,
    originalStart: new Date('2026-01-07T14:00:00Z'),
    kind: 'modified',
    title: null,
    notes: null,
    location: null,
    color: null,
    startsAt: null,
    endsAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const budget = (n = 1000) => ({ remaining: n });
const win = (from: string, to: string) => ({ from: new Date(from), to: new Date(to) });

describe('expandEvent: non-recurring events', () => {
  it('returns the single event when it overlaps the window', () => {
    const e = event();
    const occurrences = expandEvent(e, [], { ...win('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z'), budget: budget() });
    expect(occurrences).toEqual([
      { originalStart: e.startsAt, startsAt: e.startsAt, endsAt: e.endsAt, title: 'Event', notes: null, location: null, color: null, modified: false },
    ]);
  });

  it('excludes it when the window ends exactly at its start, or starts exactly at its end', () => {
    const e = event();
    expect(expandEvent(e, [], { from: new Date('2025-01-01T00:00:00Z'), to: e.startsAt, budget: budget() })).toEqual([]);
    expect(expandEvent(e, [], { from: e.endsAt, to: new Date('2027-01-01T00:00:00Z'), budget: budget() })).toEqual([]);
  });

  it('is included when it merely overlaps the edges of the window', () => {
    const e = event();
    expect(expandEvent(e, [], { from: new Date(e.startsAt.getTime() - 1), to: new Date(e.startsAt.getTime() + 1), budget: budget() })).toHaveLength(1);
    expect(expandEvent(e, [], { from: new Date(e.endsAt.getTime() - 1), to: new Date(e.endsAt.getTime() + 1), budget: budget() })).toHaveLength(1);
  });

  it('spends exactly one unit of budget, and throws once none is left', () => {
    const e = event();
    const b = budget(1);
    expandEvent(e, [], { ...win('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z'), budget: b });
    expect(b.remaining).toBe(0);
    expect(() => expandEvent(event(), [], { ...win('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z'), budget: b })).toThrow(BadRequestException);
  });
});

describe('expandEvent: recurrence and DST', () => {
  it('keeps the wall-clock time and duration across a spring-forward transition', () => {
    const e = event({ rrule: 'FREQ=DAILY' });
    const occurrences = expandEvent(e, [], { ...win('2026-03-05T00:00:00Z', '2026-03-11T00:00:00Z'), budget: budget() });
    expect(occurrences.map((o) => [o.startsAt.toISOString(), o.endsAt.toISOString()])).toEqual([
      ['2026-03-05T14:00:00.000Z', '2026-03-05T15:00:00.000Z'], // EST, UTC-5
      ['2026-03-06T14:00:00.000Z', '2026-03-06T15:00:00.000Z'],
      ['2026-03-07T14:00:00.000Z', '2026-03-07T15:00:00.000Z'],
      ['2026-03-08T13:00:00.000Z', '2026-03-08T14:00:00.000Z'], // EDT, UTC-4, from spring-forward day
      ['2026-03-09T13:00:00.000Z', '2026-03-09T14:00:00.000Z'],
      ['2026-03-10T13:00:00.000Z', '2026-03-10T14:00:00.000Z'],
    ]);
  });

  it('keeps the wall-clock time and duration across a fall-back transition', () => {
    const e = event({ rrule: 'FREQ=DAILY' });
    const occurrences = expandEvent(e, [], { ...win('2026-10-30T00:00:00Z', '2026-11-03T00:00:00Z'), budget: budget() });
    expect(occurrences.map((o) => o.startsAt.toISOString())).toEqual([
      '2026-10-30T13:00:00.000Z', // EDT
      '2026-10-31T13:00:00.000Z',
      '2026-11-01T14:00:00.000Z', // EST, from fall-back day
      '2026-11-02T14:00:00.000Z',
    ]);
  });

  it('preserves a multi-day duration in whole wall-clock days when reapplied across an unrelated DST change', () => {
    // Master itself spans the spring-forward night: Sat 13:00 EST -> Mon 08:00 EDT.
    const e = event({
      startsAt: new Date('2026-01-03T18:00:00Z'), // Sat 13:00 EST
      endsAt: new Date('2026-03-09T13:00:00Z'), // irrelevant for the master itself; only used via the FIRST occurrence's own span below
    });
    // Use a master whose own first occurrence spans the DST night, then recur it monthly and check a
    // later, non-DST-crossing occurrence keeps the exact same wall-clock start/end pattern.
    const multiDay = event({
      startsAt: new Date('2026-03-07T18:00:00Z'), // Sat 13:00 EST
      endsAt: new Date('2026-03-09T13:00:00Z'), // Mon 08:00 EDT (spans spring-forward)
      rrule: 'FREQ=MONTHLY;BYMONTHDAY=7',
    });
    const occurrences = expandEvent(multiDay, [], { ...win('2026-06-01T00:00:00Z', '2026-06-10T00:00:00Z'), budget: budget() });
    expect(occurrences).toHaveLength(1);
    const [june] = occurrences;
    // BYMONTHDAY=7: June 7 2026 at 13:00 EDT (no DST change nearby), running the master's
    // own wall-clock duration (1 day 20 hours) forward from there.
    expect(june.startsAt.toISOString()).toBe('2026-06-07T17:00:00.000Z');
    expect(june.endsAt.toISOString()).toBe('2026-06-09T13:00:00.000Z');
    void e;
  });

  it('omits a daily local time that falls inside a spring-forward gap', () => {
    // 02:30 America/New_York does not exist on 2026-03-08 (clocks jump 02:00 -> 03:00).
    const e = event({ startsAt: new Date('2026-03-06T07:30:00Z'), endsAt: new Date('2026-03-06T08:00:00Z'), rrule: 'FREQ=DAILY' });
    const occurrences = expandEvent(e, [], { ...win('2026-03-06T00:00:00Z', '2026-03-10T00:00:00Z'), budget: budget() });
    expect(occurrences.map((o) => o.startsAt.toISOString())).toEqual([
      '2026-03-06T07:30:00.000Z',
      '2026-03-07T07:30:00.000Z',
      // Mar 8 is skipped entirely - it is not a valid local time.
      '2026-03-09T06:30:00.000Z',
    ]);
  });

  it('is immune to DST for an all-day event, which is calendar-date arithmetic in UTC', () => {
    const e = event({
      allDay: true,
      startsAt: new Date('2026-01-10T00:00:00Z'),
      endsAt: new Date('2026-01-13T00:00:00Z'), // a 3-day event
      rrule: 'FREQ=MONTHLY;BYMONTHDAY=10',
    });
    const occurrences = expandEvent(e, [], { ...win('2026-01-01T00:00:00Z', '2026-04-01T00:00:00Z'), budget: budget() });
    expect(occurrences.map((o) => [o.startsAt.toISOString(), o.endsAt.toISOString()])).toEqual([
      ['2026-01-10T00:00:00.000Z', '2026-01-13T00:00:00.000Z'],
      ['2026-02-10T00:00:00.000Z', '2026-02-13T00:00:00.000Z'],
      ['2026-03-10T00:00:00.000Z', '2026-03-13T00:00:00.000Z'], // spans the March DST change untouched
    ]);
  });

  it('handles month-end recurrence, skipping months without that day', () => {
    const e = event({ startsAt: new Date('2026-01-31T14:00:00Z'), endsAt: new Date('2026-01-31T15:00:00Z'), timezone: 'UTC', rrule: 'FREQ=MONTHLY;BYMONTHDAY=31' });
    const occurrences = expandEvent(e, [], { ...win('2026-01-01T00:00:00Z', '2026-08-01T00:00:00Z'), budget: budget() });
    expect(occurrences.map((o) => o.startsAt.toISOString().slice(0, 10))).toEqual(['2026-01-31', '2026-03-31', '2026-05-31', '2026-07-31']);
  });

  it('handles the last day of the month via BYMONTHDAY=-1, including February in a leap and non-leap year', () => {
    const e = event({ startsAt: new Date('2028-01-31T14:00:00Z'), endsAt: new Date('2028-01-31T15:00:00Z'), timezone: 'UTC', rrule: 'FREQ=MONTHLY;BYMONTHDAY=-1' });
    const occurrences = expandEvent(e, [], { ...win('2028-01-01T00:00:00Z', '2028-04-01T00:00:00Z'), budget: budget() });
    expect(occurrences.map((o) => o.startsAt.toISOString().slice(0, 10))).toEqual(['2028-01-31', '2028-02-29', '2028-03-31']);
  });

  it('finds the nth weekday of the month (second Tuesday)', () => {
    const e = event({ startsAt: new Date('2026-01-13T14:00:00Z'), endsAt: new Date('2026-01-13T15:00:00Z'), timezone: 'UTC', rrule: 'FREQ=MONTHLY;BYDAY=2TU' });
    const occurrences = expandEvent(e, [], { ...win('2026-01-01T00:00:00Z', '2026-04-01T00:00:00Z'), budget: budget() });
    expect(occurrences.map((o) => o.startsAt.toISOString().slice(0, 10))).toEqual(['2026-01-13', '2026-02-10', '2026-03-10']);
  });

  it('finds the last weekday of the month (last Friday)', () => {
    const e = event({ startsAt: new Date('2026-01-30T14:00:00Z'), endsAt: new Date('2026-01-30T15:00:00Z'), timezone: 'UTC', rrule: 'FREQ=MONTHLY;BYDAY=-1FR' });
    const occurrences = expandEvent(e, [], { ...win('2026-01-01T00:00:00Z', '2026-04-01T00:00:00Z'), budget: budget() });
    expect(occurrences.map((o) => o.startsAt.toISOString().slice(0, 10))).toEqual(['2026-01-30', '2026-02-27', '2026-03-27']);
  });

  it('finds the last weekday of the month via BYDAY+BYSETPOS (any weekday, not a specific one)', () => {
    const e = event({ startsAt: new Date('2026-01-30T14:00:00Z'), endsAt: new Date('2026-01-30T15:00:00Z'), timezone: 'UTC', rrule: 'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1' });
    const occurrences = expandEvent(e, [], { ...win('2026-01-01T00:00:00Z', '2026-04-01T00:00:00Z'), budget: budget() });
    // Jan 31 2026 is a Saturday, so the last weekday of January is the 30th (Friday).
    expect(occurrences.map((o) => o.startsAt.toISOString().slice(0, 10))).toEqual(['2026-01-30', '2026-02-27', '2026-03-31']);
  });

  it('supports multiple weekdays and INTERVAL on a weekly rule', () => {
    const e = event({ timezone: 'UTC', rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR' });
    const occurrences = expandEvent(e, [], { ...win('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z'), budget: budget() });
    expect(occurrences.map((o) => o.startsAt.toISOString().slice(0, 10))).toEqual(['2026-01-05', '2026-01-07', '2026-01-09', '2026-01-19', '2026-01-21', '2026-01-23']);
  });

  it('spends one budget unit per occurrence and stops (throws) once exhausted', () => {
    const e = event({ rrule: 'FREQ=DAILY' });
    const b = budget(3);
    expect(() => expandEvent(e, [], { ...win('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z'), budget: b })).toThrow(BadRequestException);
  });
});

describe('expandEvent: exceptions', () => {
  const series = () => event({ rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' });

  it('omits a cancelled occurrence, leaving the others untouched', () => {
    const e = series();
    const wed = new Date('2026-01-07T14:00:00Z');
    const occurrences = expandEvent(e, [exception(e.id, { originalStart: wed, kind: 'cancelled' })], {
      ...win('2026-01-01T00:00:00Z', '2026-01-12T00:00:00Z'),
      budget: budget(),
    });
    expect(occurrences.map((o) => o.originalStart.toISOString())).toEqual(['2026-01-05T14:00:00.000Z', '2026-01-09T14:00:00.000Z']);
  });

  it('applies a modified occurrence\'s overrides, and inherits whatever was not overridden', () => {
    const e = series();
    const fri = new Date('2026-01-09T14:00:00Z');
    const occurrences = expandEvent(
      e,
      [exception(e.id, { originalStart: fri, kind: 'modified', title: 'Moved', location: 'Room B' })],
      { ...win('2026-01-01T00:00:00Z', '2026-01-12T00:00:00Z'), budget: budget() },
    );
    const modified = occurrences.find((o) => o.originalStart.getTime() === fri.getTime())!;
    expect(modified).toMatchObject({ title: 'Moved', location: 'Room B', notes: null, color: null, modified: true, startsAt: fri, endsAt: naturalOccurrenceEnd(e, fri) });
    const untouched = occurrences.find((o) => o.originalStart.getTime() !== fri.getTime())!;
    expect(untouched.modified).toBe(false);
  });

  it('moves a modified occurrence in time and still finds it if the new time is inside the window', () => {
    const e = series();
    const fri = new Date('2026-01-09T14:00:00Z');
    const movedStart = new Date('2026-01-10T18:00:00Z'); // moved to Saturday
    const occurrences = expandEvent(
      e,
      [exception(e.id, { originalStart: fri, kind: 'modified', startsAt: movedStart, endsAt: new Date(movedStart.getTime() + 3_600_000) })],
      { ...win('2026-01-01T00:00:00Z', '2026-01-12T00:00:00Z'), budget: budget() },
    );
    const moved = occurrences.find((o) => o.originalStart.getTime() === fri.getTime())!;
    expect(moved.startsAt).toEqual(movedStart);
  });

  it('finds a modified occurrence pulled in from before the window by a long duration', () => {
    const e = event({ startsAt: new Date('2026-01-05T14:00:00Z'), endsAt: new Date('2026-01-05T15:00:00Z'), rrule: 'FREQ=WEEKLY;BYDAY=MO' });
    const mon = new Date('2026-01-05T14:00:00Z');
    // Modified to run long, ending inside a window that starts after its natural slot.
    const occurrences = expandEvent(
      e,
      [exception(e.id, { originalStart: mon, kind: 'modified', startsAt: mon, endsAt: new Date('2026-01-06T10:00:00Z') })],
      { from: new Date('2026-01-06T00:00:00Z'), to: new Date('2026-01-07T00:00:00Z'), budget: budget() },
    );
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].originalStart).toEqual(mon);
  });

  it('does not apply an exception belonging to a different event', () => {
    const e = series();
    const wed = new Date('2026-01-07T14:00:00Z');
    const occurrences = expandEvent(e, [exception('some-other-event', { originalStart: wed, kind: 'cancelled' })], {
      ...win('2026-01-01T00:00:00Z', '2026-01-12T00:00:00Z'),
      budget: budget(),
    });
    expect(occurrences.map((o) => o.originalStart.getTime())).toContain(wed.getTime());
  });
});

describe('isNaturalOccurrence', () => {
  it('is true only for an instant the rule actually produces', () => {
    const e = event({ rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' });
    expect(isNaturalOccurrence(e, new Date('2026-01-05T14:00:00Z'))).toBe(true); // Monday
    expect(isNaturalOccurrence(e, new Date('2026-01-06T14:00:00Z'))).toBe(false); // Tuesday
    expect(isNaturalOccurrence(e, new Date('2026-01-05T14:00:01Z'))).toBe(false); // one second off
  });

  it('for a non-recurring event, is true only at its own startsAt', () => {
    const e = event();
    expect(isNaturalOccurrence(e, e.startsAt)).toBe(true);
    expect(isNaturalOccurrence(e, new Date(e.startsAt.getTime() + 1))).toBe(false);
  });
});

describe('naturalOccurrenceEnd', () => {
  it('adds the master\'s own wall-clock duration to the given start', () => {
    const e = event(); // 1 hour, 09:00-10:00 America/New_York
    const occStart = new Date('2026-06-01T13:00:00Z'); // some other Monday, 09:00 EDT
    expect(naturalOccurrenceEnd(e, occStart).toISOString()).toBe('2026-06-01T14:00:00.000Z');
  });
});

describe('assertRRulePossible', () => {
  it('accepts a rule that can occur', () => {
    expect(() => assertRRulePossible('FREQ=WEEKLY;BYDAY=MO', new Date('2026-01-05T14:00:00Z'), false, 'UTC')).not.toThrow();
  });

  it.each([
    ['Feb 30 every year', 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30'],
    ['April 31 every year', 'FREQ=YEARLY;BYMONTH=4;BYMONTHDAY=31'],
  ])('rejects a rule that can never occur: %s', (_name, rrule) => {
    expect(() => assertRRulePossible(rrule, new Date('2026-01-05T14:00:00Z'), false, 'UTC')).toThrow(BadRequestException);
  });

  it('rejects an UNTIL absurdly far after startsAt', () => {
    expect(() => assertRRulePossible('FREQ=DAILY;UNTIL=2300-01-01', new Date('2026-01-05T14:00:00Z'), false, 'UTC')).toThrow(BadRequestException);
  });
});

describe('computeSeriesUntil', () => {
  it('is null for an open-ended rule', () => {
    expect(computeSeriesUntil('FREQ=DAILY', new Date('2026-01-05T14:00:00Z'), false, 'UTC')).toBeNull();
  });

  it('is the UNTIL instant directly for a UNTIL-bound rule', () => {
    expect(computeSeriesUntil('FREQ=DAILY;UNTIL=2026-03-01T00:00:00Z', new Date('2026-01-05T14:00:00Z'), false, 'UTC')).toEqual(
      new Date('2026-03-01T00:00:00Z'),
    );
  });

  it('is the true last occurrence for a COUNT-bound rule', () => {
    expect(computeSeriesUntil('FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=5', new Date('2026-01-05T14:00:00Z'), false, 'America/New_York')).toEqual(
      new Date('2026-01-14T14:00:00Z'),
    );
  });
});
