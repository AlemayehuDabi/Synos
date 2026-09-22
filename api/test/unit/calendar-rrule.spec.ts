import { describe, expect, it } from 'vitest';
import { buildIcsString, isValidRRuleValue, parseRRule, serializeRRule, truncateRRuleBefore } from '../../src/calendar/recurrence/rrule.js';

describe('parseRRule', () => {
  it('accepts a plain daily rule with defaults filled in', () => {
    expect(parseRRule('FREQ=DAILY')).toEqual({ freq: 'DAILY', interval: 1 });
  });

  it('accepts every documented component', () => {
    const parsed = parseRRule('FREQ=MONTHLY;INTERVAL=2;BYDAY=2TU,-1FR;BYMONTHDAY=1,-1;BYSETPOS=1;WKST=SU');
    expect(parsed).toMatchObject({
      freq: 'MONTHLY',
      interval: 2,
      byDay: ['2TU', '-1FR'],
      byMonthDay: [1, -1],
      bySetPos: [1],
      wkst: 'SU',
    });
  });

  it('is case-insensitive on keys and values', () => {
    expect(parseRRule('freq=weekly;byday=mo,we')).toMatchObject({ freq: 'WEEKLY', byDay: ['MO', 'WE'] });
  });

  it('parses UNTIL as a plain ISO instant or date, not an ICS token', () => {
    expect(parseRRule('FREQ=DAILY;UNTIL=2026-12-31T23:59:59Z').until).toEqual(new Date('2026-12-31T23:59:59Z'));
    expect(parseRRule('FREQ=DAILY;UNTIL=2026-12-31').until).toEqual(new Date('2026-12-31'));
  });

  it.each([
    ['no FREQ', 'INTERVAL=2'],
    ['an unsupported FREQ', 'FREQ=HOURLY'],
    ['a sub-daily frequency some libraries allow', 'FREQ=MINUTELY'],
    ['an unknown component', 'FREQ=DAILY;BYHOUR=9'],
    ['a duplicate component', 'FREQ=DAILY;FREQ=WEEKLY'],
    ['a malformed component', 'FREQ=DAILY;BOGUS'],
    ['an empty value', 'FREQ=DAILY;INTERVAL='],
    ['INTERVAL=0', 'FREQ=DAILY;INTERVAL=0'],
    ['INTERVAL too large', 'FREQ=DAILY;INTERVAL=1001'],
    ['both COUNT and UNTIL', 'FREQ=DAILY;COUNT=3;UNTIL=2026-12-31'],
    ['COUNT=0', 'FREQ=DAILY;COUNT=0'],
    ['COUNT over the cap', 'FREQ=DAILY;COUNT=1001'],
    ['a malformed UNTIL', 'FREQ=DAILY;UNTIL=not-a-date'],
    ['an ordinal BYDAY on a weekly rule', 'FREQ=WEEKLY;BYDAY=2MO'],
    ['an out-of-range BYDAY ordinal', 'FREQ=MONTHLY;BYDAY=54MO'],
    ['a zero BYDAY ordinal', 'FREQ=MONTHLY;BYDAY=0MO'],
    ['a bad weekday code', 'FREQ=WEEKLY;BYDAY=XX'],
    ['BYMONTHDAY on a weekly rule', 'FREQ=WEEKLY;BYMONTHDAY=1'],
    ['BYMONTHDAY=0', 'FREQ=MONTHLY;BYMONTHDAY=0'],
    ['BYMONTHDAY=32', 'FREQ=MONTHLY;BYMONTHDAY=32'],
    ['BYMONTH on a monthly rule', 'FREQ=MONTHLY;BYMONTH=1'],
    ['BYMONTH=13', 'FREQ=YEARLY;BYMONTH=13'],
    ['BYSETPOS without BYDAY', 'FREQ=MONTHLY;BYSETPOS=1'],
    ['BYSETPOS on a weekly rule', 'FREQ=WEEKLY;BYDAY=MO;BYSETPOS=1'],
    ['a bad WKST', 'FREQ=WEEKLY;WKST=XX'],
    ['a rule that is far too long', `FREQ=DAILY;BYMONTHDAY=${Array.from({ length: 200 }, (_, i) => (i % 28) + 1).join(',')}`],
  ])('rejects %s', (_name, rrule) => {
    expect(() => parseRRule(rrule)).toThrow();
    expect(isValidRRuleValue(rrule)).toBe(false);
  });

  it('accepts a nth weekday on monthly/yearly rules', () => {
    expect(() => parseRRule('FREQ=MONTHLY;BYDAY=2TU')).not.toThrow();
    expect(() => parseRRule('FREQ=YEARLY;BYMONTH=11;BYDAY=4TH')).not.toThrow();
  });

  it('rejects a non-string value', () => {
    expect(isValidRRuleValue(42)).toBe(false);
    expect(isValidRRuleValue(null)).toBe(false);
  });
});

describe('serializeRRule / buildIcsString round-trip', () => {
  it('round-trips every component through parse -> serialize -> parse', () => {
    const original = 'FREQ=MONTHLY;INTERVAL=3;BYDAY=2TU,-1FR;BYMONTHDAY=1,-1;BYSETPOS=1;WKST=SU';
    const reparsed = parseRRule(serializeRRule(parseRRule(original)));
    expect(reparsed).toEqual(parseRRule(original));
  });

  it('round-trips a COUNT-bound and a UNTIL-bound rule', () => {
    expect(parseRRule(serializeRRule(parseRRule('FREQ=DAILY;COUNT=5')))).toEqual(parseRRule('FREQ=DAILY;COUNT=5'));
    const untilRule = parseRRule('FREQ=DAILY;UNTIL=2026-12-31T23:59:59.000Z');
    expect(parseRRule(serializeRRule(untilRule)).until).toEqual(untilRule.until);
  });

  it('omits INTERVAL when it is 1, the implicit default', () => {
    expect(serializeRRule(parseRRule('FREQ=DAILY'))).toBe('FREQ=DAILY');
    expect(serializeRRule(parseRRule('FREQ=DAILY;INTERVAL=1'))).toBe('FREQ=DAILY');
  });

  it('builds a DTSTART;TZID line with the local wall-clock time, and UTC UNTIL as an ICS token', () => {
    const ics = buildIcsString(parseRRule('FREQ=DAILY;UNTIL=2026-12-31T23:59:59Z'), new Date('2026-09-22T14:00:00Z'), 'America/New_York');
    expect(ics).toBe('DTSTART;TZID=America/New_York:20260922T100000\nRRULE:FREQ=DAILY;UNTIL=20261231T235959Z');
  });
});

describe('truncateRRuleBefore', () => {
  it('replaces COUNT/UNTIL with a new UNTIL just before the cut, keeping everything else', () => {
    const truncated = parseRRule(truncateRRuleBefore('FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=50', new Date('2026-10-01T00:00:00Z')));
    expect(truncated.count).toBeUndefined();
    expect(truncated.until).toEqual(new Date('2026-09-30T23:59:59.999Z'));
    expect(truncated.byDay).toEqual(['MO', 'WE', 'FR']);
  });

  it('lowers an existing UNTIL that already precedes the cut, rather than raising it', () => {
    // truncateRRuleBefore always sets UNTIL to just before the cut, whatever it was before -
    // the caller (splitting/truncating a series) always wants a strictly earlier bound.
    const truncated = parseRRule(truncateRRuleBefore('FREQ=DAILY;UNTIL=2030-01-01', new Date('2026-01-01T00:00:00Z')));
    expect(truncated.until).toEqual(new Date('2025-12-31T23:59:59.999Z'));
  });
});
