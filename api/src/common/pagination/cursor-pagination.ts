import { BadRequestException } from '@nestjs/common';

/**
 * Cursor-based pagination convention shared across modules. Nothing in this task
 * paginates yet, but future list endpoints (tasks, habits, ...) should use this
 * instead of inventing their own offset/limit scheme.
 */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface CursorPaginationArgs {
  cursor?: string;
  limit?: number;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export function resolvePageSize(limit?: number): number {
  if (!limit) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE_SIZE);
}

export function encodeCursor(value: string | Date): string {
  const raw = value instanceof Date ? value.toISOString() : value;
  return Buffer.from(raw, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, 'base64url').toString('utf8');
}

/**
 * Compound (sortValue, id) cursor for "ORDER BY sortField DESC, id DESC" list
 * endpoints, so rows sharing the exact same timestamp are never skipped or
 * duplicated across pages the way a timestamp-only cursor could.
 */
export function encodeCompoundCursor(sortValue: Date, id: string): string {
  return encodeCursor(`${sortValue.toISOString()}|${id}`);
}

export interface DecodedCompoundCursor {
  sortValue: Date;
  id: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function decodeCompoundCursor(cursor: string): DecodedCompoundCursor {
  const raw = decodeCursor(cursor);
  const separatorIndex = raw.lastIndexOf('|');
  if (separatorIndex === -1) {
    throw new BadRequestException('Malformed cursor');
  }
  const sortValue = new Date(raw.slice(0, separatorIndex));
  const id = raw.slice(separatorIndex + 1);
  if (Number.isNaN(sortValue.getTime()) || !UUID_PATTERN.test(id)) {
    throw new BadRequestException('Malformed cursor');
  }
  return { sortValue, id };
}

/**
 * Prisma `where` fragment for "strictly before this (sortValue, id) pair" (or, with
 * `direction: 'asc'`, "strictly after"), matching `ORDER BY [sortField] {direction}, id
 * {direction}`. Defaults to `desc`, the newest-first convention most list endpoints use.
 */
export function compoundCursorWhere(sortField: string, cursor: DecodedCompoundCursor, direction: 'asc' | 'desc' = 'desc') {
  const op = direction === 'desc' ? 'lt' : 'gt';
  return {
    OR: [
      { [sortField]: { [op]: cursor.sortValue } },
      { [sortField]: { equals: cursor.sortValue }, id: { [op]: cursor.id } },
    ],
  };
}

/**
 * Same idea as `encodeCompoundCursor`/`decodeCompoundCursor`/`compoundCursorWhere`, for a
 * `Float`/`Int` sort field (e.g. a manually-reorderable `sortOrder`) instead of a `DateTime`
 * one - kept separate rather than widening the `Date`-typed functions above, so every
 * existing caller of those keeps its exact current type-checking.
 */
export function encodeNumericCompoundCursor(sortValue: number, id: string): string {
  return encodeCursor(`${sortValue}|${id}`);
}

export interface DecodedNumericCompoundCursor {
  sortValue: number;
  id: string;
}

export function decodeNumericCompoundCursor(cursor: string): DecodedNumericCompoundCursor {
  const raw = decodeCursor(cursor);
  const separatorIndex = raw.lastIndexOf('|');
  if (separatorIndex === -1) {
    throw new BadRequestException('Malformed cursor');
  }
  const sortValue = Number(raw.slice(0, separatorIndex));
  const id = raw.slice(separatorIndex + 1);
  if (Number.isNaN(sortValue) || !UUID_PATTERN.test(id)) {
    throw new BadRequestException('Malformed cursor');
  }
  return { sortValue, id };
}

export function numericCompoundCursorWhere(sortField: string, cursor: DecodedNumericCompoundCursor, direction: 'asc' | 'desc' = 'desc') {
  const op = direction === 'desc' ? 'lt' : 'gt';
  return {
    OR: [
      { [sortField]: { [op]: cursor.sortValue } },
      { [sortField]: { equals: cursor.sortValue }, id: { [op]: cursor.id } },
    ],
  };
}
