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
