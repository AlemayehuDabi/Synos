import { registerDecorator, type ValidationOptions } from 'class-validator';

/**
 * The RRULE subset this API accepts, restricted to exactly what the brief asks
 * for: daily/weekly/monthly/yearly, interval, multiple weekdays, nth/last
 * weekday, month-day lists, and COUNT or UNTIL. Sub-daily frequencies
 * (HOURLY/MINUTELY/SECONDLY) and BYYEARDAY/BYWEEKNO/BYHOUR/etc. are rejected:
 * they are outside the required vocabulary and would make the occurrence caps
 * below far harder to reason about.
 *
 * `UNTIL` is written and read as a normal ISO-8601 instant/date
 * ("2026-12-31T23:59:59Z" or "2026-12-31"), not the bare ICS token
 * (`20261231T235959Z`) RFC 5545 itself uses on the wire - friendlier for API
 * clients, and converted to the ICS token form only when handed to the
 * recurrence engine.
 */
export const SUPPORTED_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const;
export type SupportedFrequency = (typeof SUPPORTED_FREQUENCIES)[number];

const WEEKDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
const ALLOWED_KEYS = ['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'BYSETPOS', 'WKST'] as const;

/** Sanity bound on COUNT so seriesUntil (computed via a COUNT-bounded walk) always stays cheap. */
export const MAX_RRULE_COUNT = 1000;
/** Sanity bound on how far UNTIL may sit after DTSTART. Pure data hygiene, not a performance limit. */
export const MAX_RRULE_UNTIL_YEARS_AHEAD = 100;

export interface ParsedRRule {
  freq: SupportedFrequency;
  interval: number;
  count?: number;
  /** Parsed as a UTC instant (for an all-day series, the calendar date at UTC midnight). */
  until?: Date;
  byDay?: string[];
  byMonthDay?: number[];
  byMonth?: number[];
  bySetPos?: number[];
  wkst?: string;
}

class RRuleValidationError extends Error {}

function fail(message: string): never {
  throw new RRuleValidationError(message);
}

function parseIntList(raw: string, key: string, min: number, max: number): number[] {
  const values = raw.split(',').map((part) => {
    if (!/^-?\d+$/.test(part)) fail(`${key} must be a comma-separated list of integers`);
    const n = Number(part);
    if (n === 0 || n < min || n > max) fail(`${key} values must be in [${min},-1] or [1,${max}]`);
    return n;
  });
  if (values.length === 0) fail(`${key} must not be empty`);
  return values;
}

const BYDAY_TOKEN = /^(-?[1-9]\d?)?(MO|TU|WE|TH|FR|SA|SU)$/;

function parseByDay(raw: string, freq: SupportedFrequency): string[] {
  const tokens = raw.split(',').map((token) => token.trim().toUpperCase());
  if (tokens.length === 0) fail('BYDAY must not be empty');
  for (const token of tokens) {
    const match = BYDAY_TOKEN.exec(token);
    if (!match) fail(`"${token}" is not a valid BYDAY value (e.g. MO, 2TU, -1FR)`);
    const [, ordinal] = match;
    if (ordinal) {
      if (freq === 'WEEKLY') fail('BYDAY cannot use an ordinal (e.g. "2TU") with a weekly rule');
      const n = Number(ordinal);
      if (n === 0 || n < -53 || n > 53) fail('BYDAY ordinals must be in [-53,-1] or [1,53]');
    }
  }
  return tokens;
}

/** Structural validation of the RRULE value only (no DTSTART/timezone involved). */
export function parseRRule(rrule: string): ParsedRRule {
  if (rrule.length > 500) fail('rrule is too long');
  const seen = new Set<string>();
  const components: Record<string, string> = {};
  for (const part of rrule.split(';')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq === -1) fail(`"${part}" is not a valid KEY=VALUE component`);
    const key = part.slice(0, eq).trim().toUpperCase();
    const value = part.slice(eq + 1).trim();
    if (!value) fail(`${key} must not be empty`);
    if (seen.has(key)) fail(`${key} appears more than once`);
    seen.add(key);
    if (!ALLOWED_KEYS.includes(key as (typeof ALLOWED_KEYS)[number])) {
      fail(`"${key}" is not a supported RRULE component`);
    }
    components[key] = value;
  }

  const freqRaw = components.FREQ;
  if (!freqRaw) fail('FREQ is required');
  const freq = freqRaw.toUpperCase();
  if (!SUPPORTED_FREQUENCIES.includes(freq as SupportedFrequency)) {
    fail(`FREQ must be one of ${SUPPORTED_FREQUENCIES.join(', ')}`);
  }

  let interval = 1;
  if (components.INTERVAL !== undefined) {
    if (!/^\d+$/.test(components.INTERVAL)) fail('INTERVAL must be a positive integer');
    interval = Number(components.INTERVAL);
    if (interval < 1 || interval > 1000) fail('INTERVAL must be between 1 and 1000');
  }

  if (components.COUNT !== undefined && components.UNTIL !== undefined) {
    fail('COUNT and UNTIL cannot both be set');
  }

  let count: number | undefined;
  if (components.COUNT !== undefined) {
    if (!/^\d+$/.test(components.COUNT)) fail('COUNT must be a positive integer');
    count = Number(components.COUNT);
    if (count < 1 || count > MAX_RRULE_COUNT) fail(`COUNT must be between 1 and ${MAX_RRULE_COUNT}`);
  }

  let until: Date | undefined;
  if (components.UNTIL !== undefined) {
    const parsed = new Date(components.UNTIL);
    if (Number.isNaN(parsed.getTime())) fail('UNTIL must be a valid ISO-8601 date or date-time');
    until = parsed;
  }

  const byDay = components.BYDAY !== undefined ? parseByDay(components.BYDAY, freq as SupportedFrequency) : undefined;
  const byMonthDay =
    components.BYMONTHDAY !== undefined ? parseIntList(components.BYMONTHDAY, 'BYMONTHDAY', -31, 31) : undefined;
  const byMonth = components.BYMONTH !== undefined ? parseIntList(components.BYMONTH, 'BYMONTH', 1, 12) : undefined;
  const bySetPos = components.BYSETPOS !== undefined ? parseIntList(components.BYSETPOS, 'BYSETPOS', -366, 366) : undefined;

  if (byMonthDay && freq !== 'MONTHLY' && freq !== 'YEARLY') fail('BYMONTHDAY is only valid with a monthly or yearly rule');
  if (byMonth && freq !== 'YEARLY') fail('BYMONTH is only valid with a yearly rule');
  if (bySetPos && !byDay) fail('BYSETPOS requires BYDAY');
  if (bySetPos && freq !== 'MONTHLY' && freq !== 'YEARLY') fail('BYSETPOS is only valid with a monthly or yearly rule');

  let wkst: string | undefined;
  if (components.WKST !== undefined) {
    wkst = components.WKST.toUpperCase();
    if (!WEEKDAY_CODES.includes(wkst as (typeof WEEKDAY_CODES)[number])) fail('WKST must be a weekday code (e.g. MO)');
  }

  return { freq: freq as SupportedFrequency, interval, count, until, byDay, byMonthDay, byMonth, bySetPos, wkst };
}

export function isValidRRuleValue(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    parseRRule(value);
    return true;
  } catch {
    return false;
  }
}

/** DTO-level validator: only checks the RRULE's own shape, not its relationship to a particular DTSTART. */
export function IsValidRRule(options?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isValidRRule',
      target: object.constructor,
      propertyName: propertyName as string,
      options,
      validator: {
        validate: (value: unknown) => value === undefined || value === null || isValidRRuleValue(value),
        defaultMessage: () => 'rrule is not a supported recurrence rule',
      },
    });
  };
}

/** `YYYYMMDDTHHMMSS` in `timezone`'s wall clock, for use after `DTSTART;TZID=...:`. */
export function toIcsLocalDateTime(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}${get('month')}${get('day')}T${get('hour')}${get('minute')}${get('second')}`;
}

/** `YYYYMMDDTHHMMSSZ`, the RFC 5545 form UNTIL must take when DTSTART carries a TZID. */
export function toIcsUtcDateTime(instant: Date): string {
  return `${instant.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

/**
 * The bare RRULE value this API stores and accepts (`FREQ=...;INTERVAL=...`), with UNTIL
 * in plain ISO-8601 - not the RFC 5545 wire token (`buildIcsString` converts it for the
 * recurrence engine) - so a stored value round-trips through `parseRRule` unchanged.
 */
export function serializeRRule(parsed: ParsedRRule): string {
  const components = [`FREQ=${parsed.freq}`];
  if (parsed.interval !== 1) components.push(`INTERVAL=${parsed.interval}`);
  if (parsed.count !== undefined) components.push(`COUNT=${parsed.count}`);
  if (parsed.until !== undefined) components.push(`UNTIL=${parsed.until.toISOString()}`);
  if (parsed.byDay) components.push(`BYDAY=${parsed.byDay.join(',')}`);
  if (parsed.byMonth) components.push(`BYMONTH=${parsed.byMonth.join(',')}`);
  if (parsed.byMonthDay) components.push(`BYMONTHDAY=${parsed.byMonthDay.join(',')}`);
  if (parsed.bySetPos) components.push(`BYSETPOS=${parsed.bySetPos.join(',')}`);
  if (parsed.wkst) components.push(`WKST=${parsed.wkst}`);
  return components.join(';');
}

/**
 * Builds the `DTSTART...\nRRULE:...` ICS text rrule-temporal expects, re-serializing the
 * already-validated components rather than trusting the client's original formatting.
 */
export function buildIcsString(parsed: ParsedRRule, dtstart: Date, timezone: string): string {
  const dtstartLine = `DTSTART;TZID=${timezone}:${toIcsLocalDateTime(dtstart, timezone)}`;
  const components = [`FREQ=${parsed.freq}`];
  if (parsed.interval !== 1) components.push(`INTERVAL=${parsed.interval}`);
  if (parsed.count !== undefined) components.push(`COUNT=${parsed.count}`);
  if (parsed.until !== undefined) components.push(`UNTIL=${toIcsUtcDateTime(parsed.until)}`);
  if (parsed.byDay) components.push(`BYDAY=${parsed.byDay.join(',')}`);
  if (parsed.byMonth) components.push(`BYMONTH=${parsed.byMonth.join(',')}`);
  if (parsed.byMonthDay) components.push(`BYMONTHDAY=${parsed.byMonthDay.join(',')}`);
  if (parsed.bySetPos) components.push(`BYSETPOS=${parsed.bySetPos.join(',')}`);
  if (parsed.wkst) components.push(`WKST=${parsed.wkst}`);
  return `${dtstartLine}\nRRULE:${components.join(';')}`;
}

/** Returns `rrule` truncated so it produces no occurrence at or after `before` (COUNT/UNTIL replaced by a new UNTIL). */
export function truncateRRuleBefore(rrule: string, before: Date): string {
  const parsed = parseRRule(rrule);
  return serializeRRule({ ...parsed, count: undefined, until: new Date(before.getTime() - 1) });
}
