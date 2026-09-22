import { describe, expect, it } from 'vitest';
import {
  compoundCursorWhere,
  decodeCompoundCursor,
  DEFAULT_PAGE_SIZE,
  encodeCompoundCursor,
  MAX_PAGE_SIZE,
  resolvePageSize,
} from '../../src/common/pagination/cursor-pagination.js';

describe('resolvePageSize', () => {
  it('defaults when no limit is given', () => {
    expect(resolvePageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
    expect(resolvePageSize(0)).toBe(DEFAULT_PAGE_SIZE);
  });

  it('clamps to [1, MAX_PAGE_SIZE] and truncates fractions', () => {
    expect(resolvePageSize(-5)).toBe(1);
    expect(resolvePageSize(MAX_PAGE_SIZE + 50)).toBe(MAX_PAGE_SIZE);
    expect(resolvePageSize(3.9)).toBe(3);
  });
});

describe('encodeCompoundCursor / decodeCompoundCursor', () => {
  it('round-trips a (sortValue, id) pair', () => {
    const sortValue = new Date('2026-09-22T09:00:00.000Z');
    const id = '2a3b4c5d-0000-4000-8000-000000000000';
    const decoded = decodeCompoundCursor(encodeCompoundCursor(sortValue, id));
    expect(decoded).toEqual({ sortValue, id });
  });

  it('rejects a malformed cursor', () => {
    expect(() => decodeCompoundCursor('not-base64url-cursor-data')).toThrow('Malformed cursor');
    expect(() => decodeCompoundCursor(Buffer.from('no-separator').toString('base64url'))).toThrow('Malformed cursor');
    expect(() => decodeCompoundCursor(Buffer.from('not-a-date|2a3b4c5d-0000-4000-8000-000000000000').toString('base64url'))).toThrow('Malformed cursor');
    expect(() => decodeCompoundCursor(Buffer.from('2026-09-22T09:00:00.000Z|not-a-uuid').toString('base64url'))).toThrow('Malformed cursor');
  });
});

describe('compoundCursorWhere', () => {
  const cursor = { sortValue: new Date('2026-09-22T09:00:00.000Z'), id: '2a3b4c5d-0000-4000-8000-000000000000' };

  it('defaults to "strictly before" (descending pagination)', () => {
    expect(compoundCursorWhere('createdAt', cursor)).toEqual({
      OR: [{ createdAt: { lt: cursor.sortValue } }, { createdAt: { equals: cursor.sortValue }, id: { lt: cursor.id } }],
    });
    expect(compoundCursorWhere('createdAt', cursor, 'desc')).toEqual(compoundCursorWhere('createdAt', cursor));
  });

  it('is "strictly after" for ascending pagination', () => {
    expect(compoundCursorWhere('startsAt', cursor, 'asc')).toEqual({
      OR: [{ startsAt: { gt: cursor.sortValue } }, { startsAt: { equals: cursor.sortValue }, id: { gt: cursor.id } }],
    });
  });
});
