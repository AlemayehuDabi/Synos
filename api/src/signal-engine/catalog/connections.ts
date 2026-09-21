import { ConnectionMode, SignalDomain } from '../../generated/prisma/enums.js';
import type { SignalType } from './signals.js';

export interface ConnectionCatalogEntry {
  id: string;
  name: string;
  description: string;
  sourceSignals: SignalType[];
  sourceDomain: SignalDomain;
  targetDomain: SignalDomain;
  defaultMode: ConnectionMode;
  maxMode: ConnectionMode;
}

/**
 * Fixed catalog of every cross-domain connection. Deliberately not
 * user-defined or discovered: a pair either belongs here or the domains stay
 * unconnected (e.g. fitness and finances never talk to each other).
 */
export const CONNECTION_CATALOG = {
  'grocery-cost-to-budget': {
    id: 'grocery-cost-to-budget',
    name: 'Grocery cost to budget',
    description: 'Updates the grocery budget line when a grocery list is priced.',
    sourceSignals: ['grocery.cost'],
    sourceDomain: SignalDomain.meals,
    targetDomain: SignalDomain.finances,
    defaultMode: ConnectionMode.suggest,
    maxMode: ConnectionMode.auto,
  },
  'budget-overrun-to-cheaper-meals': {
    id: 'budget-overrun-to-cheaper-meals',
    name: 'Budget overrun to cheaper meals',
    description: 'Suggests cheaper meal options when a budget category runs over for the month.',
    sourceSignals: ['budget.overrun'],
    sourceDomain: SignalDomain.finances,
    targetDomain: SignalDomain.meals,
    defaultMode: ConnectionMode.suggest,
    maxMode: ConnectionMode.suggest,
  },
  'workout-to-habit': {
    id: 'workout-to-habit',
    name: 'Workout to habit',
    description: 'Checks off the matching exercise habit when a workout is completed.',
    sourceSignals: ['workout.completed'],
    sourceDomain: SignalDomain.fitness,
    targetDomain: SignalDomain.habits,
    defaultMode: ConnectionMode.suggest,
    maxMode: ConnectionMode.auto,
  },
  'recovery-to-task-load': {
    id: 'recovery-to-task-load',
    name: 'Recovery to task load',
    description:
      "Softens today's task load after poor sleep or a heavy training block; never touches tasks marked critical.",
    sourceSignals: ['sleep.poor', 'training.heavy'],
    sourceDomain: SignalDomain.fitness,
    targetDomain: SignalDomain.tasks,
    defaultMode: ConnectionMode.suggest,
    maxMode: ConnectionMode.suggest,
  },
  'recurring-task-to-habit': {
    id: 'recurring-task-to-habit',
    name: 'Recurring task to habit',
    description: 'Offers to turn a detected recurring task pattern into a habit.',
    sourceSignals: ['task.recurring_pattern'],
    sourceDomain: SignalDomain.tasks,
    targetDomain: SignalDomain.habits,
    defaultMode: ConnectionMode.suggest,
    maxMode: ConnectionMode.suggest,
  },
  'bill-to-reminder': {
    id: 'bill-to-reminder',
    name: 'Bill to reminder',
    description: 'Creates a reminder task ahead of an upcoming bill due date.',
    sourceSignals: ['bill.due'],
    sourceDomain: SignalDomain.finances,
    targetDomain: SignalDomain.tasks,
    defaultMode: ConnectionMode.suggest,
    maxMode: ConnectionMode.auto,
  },
} satisfies Record<string, ConnectionCatalogEntry>;

export type ConnectionId = keyof typeof CONNECTION_CATALOG;

export function isKnownConnectionId(id: string): id is ConnectionId {
  return Object.hasOwn(CONNECTION_CATALOG, id);
}

export function getConnectionCatalogEntry(id: ConnectionId): ConnectionCatalogEntry {
  return CONNECTION_CATALOG[id];
}

export function allConnectionIds(): ConnectionId[] {
  return Object.keys(CONNECTION_CATALOG) as ConnectionId[];
}

export function getConnectionsForSignalType(type: SignalType): ConnectionCatalogEntry[] {
  return Object.values(CONNECTION_CATALOG).filter((connection) =>
    (connection.sourceSignals as string[]).includes(type),
  );
}
