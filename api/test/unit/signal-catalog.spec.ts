import { describe, expect, it } from 'vitest';
import {
  getSignalCatalogEntry,
  isKnownSignalType,
  registerSignalType,
} from '../../src/signal-engine/catalog/signals.js';
import { SignalDomain } from '../../src/generated/prisma/enums.js';
import { z } from 'zod';

describe('signal catalog', () => {
  it('accepts a valid meal.logged payload', () => {
    const entry = getSignalCatalogEntry('meal.logged');
    const result = entry.payloadSchema.safeParse({
      mealLogId: 'meal-1',
      loggedAt: '2026-09-21T12:00:00.000Z',
      mealType: 'lunch',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid meal.logged payload (bad mealType)', () => {
    const entry = getSignalCatalogEntry('meal.logged');
    const result = entry.payloadSchema.safeParse({
      mealLogId: 'meal-1',
      loggedAt: '2026-09-21T12:00:00.000Z',
      mealType: 'brunch',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a bill.due payload with a malformed date', () => {
    const entry = getSignalCatalogEntry('bill.due');
    const result = entry.payloadSchema.safeParse({
      billId: 'bill-1',
      dueDate: 'not-a-date',
      amountCents: 100,
      currency: 'USD',
      daysUntilDue: 3,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a budget.overrun payload with a malformed month', () => {
    const entry = getSignalCatalogEntry('budget.overrun');
    const result = entry.payloadSchema.safeParse({
      budgetId: 'b1',
      categoryKey: 'groceries',
      month: '2026-9',
      budgetCents: 1000,
      spentCents: 1200,
      overrunCents: 200,
      currency: 'USD',
    });
    expect(result.success).toBe(false);
  });

  it('reports unknown signal types as unknown', () => {
    expect(isKnownSignalType('not.a.real.type')).toBe(false);
  });

  describe('registerSignalType', () => {
    const dynamicType = `unit-test.dynamic-${Math.random().toString(36).slice(2)}`;

    it('adds a new type that becomes known', () => {
      expect(isKnownSignalType(dynamicType)).toBe(false);
      registerSignalType(dynamicType, {
        sourceDomain: SignalDomain.system,
        schemaVersion: 1,
        payloadSchema: z.object({ ok: z.boolean() }),
      });
      expect(isKnownSignalType(dynamicType)).toBe(true);
    });

    it('refuses to shadow a built-in signal type', () => {
      expect(() =>
        registerSignalType('meal.logged', {
          sourceDomain: SignalDomain.system,
          schemaVersion: 1,
          payloadSchema: z.object({}),
        }),
      ).toThrow();
    });
  });
});
