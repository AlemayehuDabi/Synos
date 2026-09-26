import '../../../core/navigation/app_destination.dart';
import '../../quick_add/data/models/quick_entry.dart';
import 'models/today_models.dart';

/// Which realistic-looking day the mock repository serves. Debug builds can
/// switch between them from the Today screen to review every state.
enum TodayScenario {
  populated('Busy day'),
  quietDay('Quiet day (some sections empty)'),
  firstRun('First run (nothing set up)'),
  overBudget('Over budget'),
  loadError('Load error');

  const TodayScenario(this.label);

  final String label;
}

/// Builds the day for [scenario], anchored to [now]'s date.
TodaySnapshot buildMockToday(TodayScenario scenario, DateTime now) {
  return switch (scenario) {
    TodayScenario.populated => _busyDay(now),
    TodayScenario.overBudget => _busyDay(now, overBudget: true),
    TodayScenario.quietDay => _quietDay(now),
    TodayScenario.firstRun ||
    TodayScenario.loadError => TodaySnapshot(asOf: now),
  };
}

DateTime _at(DateTime now, int hour, [int minute = 0]) =>
    DateTime(now.year, now.month, now.day, hour, minute);

TodaySnapshot _busyDay(DateTime now, {bool overBudget = false}) {
  DateTime at(int h, [int m = 0]) => _at(now, h, m);

  return TodaySnapshot(
    asOf: now,
    schedule: [
      ScheduleItem(
        id: 'ev-standup',
        title: 'Team standup',
        start: at(9),
        end: at(9, 30),
        source: AppDestination.calendar,
        location: 'Video call',
      ),
      ScheduleItem(
        id: 'blk-focus',
        title: 'Focus: Q4 planning outline',
        start: at(10),
        end: at(12),
        source: AppDestination.tasks,
      ),
      ScheduleItem(
        id: 'ev-lunch',
        title: 'Lunch with Maya',
        start: at(12, 30),
        end: at(13, 30),
        source: AppDestination.calendar,
        location: 'Café Lume',
      ),
      ScheduleItem(
        id: 'ev-review',
        title: 'Design review',
        start: at(15),
        end: at(16),
        source: AppDestination.calendar,
        location: 'Room 4B',
      ),
      ScheduleItem(
        id: 'blk-workout',
        title: 'Upper body strength',
        start: at(18),
        end: at(19),
        source: AppDestination.fitness,
      ),
      ScheduleItem(
        id: 'blk-dinner',
        title: 'Dinner',
        start: at(19, 30),
        end: at(20, 15),
        source: AppDestination.meals,
      ),
    ],
    tasks: const [
      PriorityTask(
        id: 't-outline',
        title: 'Finalize Q4 planning outline',
        detail: 'Due 12:00 · about 2 hours',
        isHighPriority: true,
      ),
      PriorityTask(
        id: 't-invoice',
        title: 'Send invoice to Northwind',
        detail: 'Due today',
        isHighPriority: true,
      ),
      PriorityTask(
        id: 't-dentist',
        title: 'Book dentist appointment',
        detail: 'Due yesterday',
      ),
      PriorityTask(
        id: 't-review',
        title: "Review Maya's pull request",
        detail: 'About 30 minutes',
      ),
      PriorityTask(
        id: 't-insurance',
        title: 'Renew car insurance',
        detail: 'Due Friday',
      ),
    ],
    habits: const [
      HabitItem(
        id: 'h-stretch',
        title: 'Morning stretch',
        streakDays: 12,
        done: true,
      ),
      HabitItem(id: 'h-water', title: 'Drink 2 L of water', streakDays: 4),
      HabitItem(id: 'h-read', title: 'Read 20 pages', streakDays: 9),
      HabitItem(
        id: 'h-meditate',
        title: 'Meditate for 10 minutes',
        streakDays: 3,
        done: true,
      ),
      HabitItem(id: 'h-walk', title: 'Evening walk', streakDays: 6),
      HabitItem(
        id: 'h-screens',
        title: 'No screens after 22:00',
        streakDays: 2,
        isBreakHabit: true,
      ),
    ],
    meals: [
      PlannedMeal(
        id: 'm-breakfast',
        type: MealType.breakfast,
        name: 'Greek yogurt with berries and granola',
        time: at(8),
        kcal: 420,
        logged: true,
      ),
      PlannedMeal(
        id: 'm-lunch',
        type: MealType.lunch,
        name: 'Chickpea salad bowl',
        time: at(12, 30),
        kcal: 610,
      ),
      PlannedMeal(
        id: 'm-snack',
        type: MealType.snack,
        name: 'Apple and almonds',
        time: at(16),
        kcal: 230,
      ),
      PlannedMeal(
        id: 'm-dinner',
        type: MealType.dinner,
        name: 'Baked salmon with roasted vegetables',
        time: at(19, 30),
        kcal: 720,
      ),
    ],
    budget: BudgetStatus(
      weeklyBudget: 400,
      spent: overBudget ? 431.20 : 188.40,
      daysLeft: 8 - now.weekday,
      topCategories: overBudget
          ? const [
              CategorySpend(ExpenseCategory.groceries, 148.60),
              CategorySpend(ExpenseCategory.dining, 112.30),
              CategorySpend(ExpenseCategory.bills, 95),
            ]
          : const [
              CategorySpend(ExpenseCategory.groceries, 92.10),
              CategorySpend(ExpenseCategory.dining, 61.30),
              CategorySpend(ExpenseCategory.transport, 35),
            ],
    ),
    nextWorkout: NextWorkout(
      id: 'w-upper',
      title: 'Upper body strength',
      start: at(18),
      minutes: 55,
      summary: 'Bench press, rows, overhead press and 2 more',
      programLabel: '12-week strength · Day 3 of 4',
    ),
    suggestions: const [
      Suggestion(
        id: 's-recovery',
        title: "Lighten today's task load",
        detail: 'You slept 5 h 40 min. Two tasks could move to tomorrow.',
        from: AppDestination.fitness,
        to: AppDestination.tasks,
      ),
      Suggestion(
        id: 's-walk',
        title: "Check off 'Evening walk'",
        detail: 'A 25-minute walk was logged.',
        from: AppDestination.fitness,
        to: AppDestination.habits,
      ),
      Suggestion(
        id: 's-groceries',
        title: "Add groceries to this week's budget",
        detail: 'Your meal plan needs about \$46 more.',
        from: AppDestination.meals,
        to: AppDestination.finance,
      ),
    ],
    notes: const {
      AppDestination.calendar: ConnectionNote(
        from: AppDestination.tasks,
        to: AppDestination.calendar,
        text: 'Focus time is blocked from your task “Finalize Q4 planning outline”.',
      ),
      AppDestination.finance: ConnectionNote(
        from: AppDestination.meals,
        to: AppDestination.finance,
        text: 'Your meal plan needs about \$46 more in groceries this week.',
      ),
      AppDestination.fitness: ConnectionNote(
        from: AppDestination.fitness,
        to: AppDestination.calendar,
        text: 'Held on your calendar so nothing else lands on it.',
      ),
    },
  );
}

TodaySnapshot _quietDay(DateTime now) {
  return TodaySnapshot(
    asOf: now,
    schedule: [
      ScheduleItem(
        id: 'ev-dentist',
        title: 'Dentist check-up',
        start: _at(now, 14),
        end: _at(now, 14, 45),
        source: AppDestination.calendar,
        location: 'Riverside Dental',
      ),
    ],
    tasks: const [
      PriorityTask(
        id: 't-plants',
        title: 'Repot the fern',
        detail: 'About 20 minutes',
      ),
      PriorityTask(
        id: 't-landlord',
        title: 'Reply to the landlord',
        detail: 'Due today',
      ),
    ],
    habits: const [
      HabitItem(id: 'h-stretch', title: 'Morning stretch'),
      HabitItem(id: 'h-read', title: 'Read 20 pages'),
      HabitItem(id: 'h-walk', title: 'Evening walk'),
    ],
  );
}
