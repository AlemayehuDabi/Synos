import { z } from 'zod';
import { SignalDomain } from '../../generated/prisma/enums.js';

const currency = z.string().regex(/^[A-Z]{3}$/, 'currency must be a 3-letter ISO 4217 code');
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'month must be formatted as YYYY-MM');

export interface SignalCatalogEntry {
  sourceDomain: SignalDomain;
  schemaVersion: number;
  payloadSchema: z.ZodType;
}

/**
 * Fixed registry of every signal type domains can emit. New signal types are
 * added here directly (this catalog, like the connection catalog, is not
 * discovered/extensible at runtime) - `emit()` validates against it and
 * rejects unknown types.
 */
export const SIGNAL_CATALOG = {
  'meal.logged': {
    sourceDomain: SignalDomain.meals,
    schemaVersion: 1,
    payloadSchema: z.object({
      mealLogId: z.string().min(1),
      loggedAt: z.iso.datetime(),
      mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
      calories: z.number().nonnegative().optional(),
      costCents: z.number().int().nonnegative().optional(),
      currency: currency.optional(),
    }),
  },
  'grocery.cost': {
    sourceDomain: SignalDomain.meals,
    schemaVersion: 1,
    payloadSchema: z.object({
      groceryListId: z.string().min(1),
      estimatedCostCents: z.number().int().nonnegative(),
      currency,
      periodStart: z.iso.date(),
      periodEnd: z.iso.date(),
    }),
  },
  'budget.overrun': {
    sourceDomain: SignalDomain.finances,
    schemaVersion: 1,
    payloadSchema: z.object({
      budgetId: z.string().min(1),
      categoryKey: z.string().min(1),
      month,
      budgetCents: z.number().int().nonnegative(),
      spentCents: z.number().int().nonnegative(),
      overrunCents: z.number().int(),
      currency,
    }),
  },
  'workout.completed': {
    sourceDomain: SignalDomain.fitness,
    schemaVersion: 1,
    payloadSchema: z.object({
      workoutId: z.string().min(1),
      completedAt: z.iso.datetime(),
      durationMinutes: z.number().positive(),
      workoutType: z.string().min(1),
    }),
  },
  'sleep.poor': {
    sourceDomain: SignalDomain.fitness,
    schemaVersion: 1,
    payloadSchema: z.object({
      date: z.iso.date(),
      durationMinutes: z.number().nonnegative(),
      qualityScore: z.number().min(0).max(100).optional(),
    }),
  },
  'training.heavy': {
    sourceDomain: SignalDomain.fitness,
    schemaVersion: 1,
    payloadSchema: z.object({
      date: z.iso.date(),
      loadScore: z.number(),
      windowDays: z.number().int().positive(),
    }),
  },
  'task.missed': {
    sourceDomain: SignalDomain.tasks,
    schemaVersion: 1,
    payloadSchema: z.object({
      taskId: z.string().min(1),
      dueAt: z.iso.datetime(),
      recurringGroupId: z.string().optional(),
    }),
  },
  'task.recurring_pattern': {
    sourceDomain: SignalDomain.tasks,
    schemaVersion: 1,
    payloadSchema: z.object({
      fingerprint: z.string().min(1),
      occurrences: z.number().int().positive(),
      cadenceDays: z.number().int().positive(),
      taskIds: z.array(z.string().min(1)),
    }),
  },
  'bill.due': {
    sourceDomain: SignalDomain.finances,
    schemaVersion: 1,
    payloadSchema: z.object({
      billId: z.string().min(1),
      dueDate: z.iso.date(),
      amountCents: z.number().int().nonnegative(),
      currency,
      daysUntilDue: z.number().int(),
    }),
  },
} satisfies Record<string, SignalCatalogEntry>;

export type SignalType = keyof typeof SIGNAL_CATALOG;

/**
 * Extension point: unlike the connection catalog (deliberately fixed, see
 * catalog/connections.ts), the set of signal types is expected to grow as
 * domain modules are built. A future domain module calls this once, from its
 * own module's code, to add its signal types without editing this file. The
 * sandbox test fixtures (test/sandbox/) use the exact same mechanism.
 */
const dynamicSignalCatalog = new Map<string, SignalCatalogEntry>();

export function registerSignalType(type: string, entry: SignalCatalogEntry): void {
  if (Object.hasOwn(SIGNAL_CATALOG, type)) {
    throw new Error(`Signal type "${type}" is already defined in the built-in catalog`);
  }
  dynamicSignalCatalog.set(type, entry);
}

export function isKnownSignalType(type: string): type is SignalType {
  return Object.hasOwn(SIGNAL_CATALOG, type) || dynamicSignalCatalog.has(type);
}

export function getSignalCatalogEntry(type: SignalType): SignalCatalogEntry {
  return (SIGNAL_CATALOG as Record<string, SignalCatalogEntry>)[type] ?? dynamicSignalCatalog.get(type)!;
}

export function allSignalTypes(): SignalType[] {
  return [...Object.keys(SIGNAL_CATALOG), ...dynamicSignalCatalog.keys()] as SignalType[];
}
