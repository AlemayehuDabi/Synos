import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/navigation/app_destination.dart';
import 'package:mobile/features/home/application/today_controller.dart';
import 'package:mobile/features/home/data/mock_today_data.dart';
import 'package:mobile/features/home/data/models/today_models.dart';
import 'package:mobile/features/home/data/today_providers.dart';
import 'package:mobile/features/home/data/today_repository.dart';
import 'package:mobile/features/quick_add/data/models/quick_entry.dart';

// A Saturday morning, so the budget week has two days left (Saturday, Sunday).
final _now = DateTime(2026, 9, 26, 10, 15);

MockTodayRepository _repo(TodayScenario scenario) =>
    MockTodayRepository(scenario: scenario, now: _now, latency: Duration.zero);

/// Serves the busy day, but every fetch after the first one fails.
class _FlakyRepository extends MockTodayRepository {
  _FlakyRepository()
    : super(
        scenario: TodayScenario.populated,
        now: _now,
        latency: Duration.zero,
      );

  int fetches = 0;

  @override
  Future<TodaySnapshot> fetch() async {
    if (fetches++ > 0) throw const TodayLoadException();
    return super.fetch();
  }
}

/// Fails the first load, then works.
class _FailsOnceRepository extends MockTodayRepository {
  _FailsOnceRepository()
    : super(
        scenario: TodayScenario.populated,
        now: _now,
        latency: Duration.zero,
      );

  var _failed = false;

  @override
  Future<TodaySnapshot> fetch() async {
    if (!_failed) {
      _failed = true;
      throw const TodayLoadException();
    }
    return super.fetch();
  }
}

void main() {
  group('scenarios', () {
    test('a busy day has something in every domain', () async {
      final day = await _repo(TodayScenario.populated).fetch();

      expect(day.isEmpty, isFalse);
      expect(day.schedule, hasLength(6));
      expect(day.tasks, hasLength(5));
      expect(day.habits, hasLength(6));
      expect(day.habitsDone, 2);
      expect(day.meals, hasLength(4));
      expect(day.mealsLogged, 1);
      expect(day.budget, isNotNull);
      expect(day.nextWorkout, isNotNull);
      expect(day.suggestions, hasLength(3));
    });

    test(
      'the schedule mixes calendar events with blocks from other domains',
      () async {
        final day = await _repo(TodayScenario.populated).fetch();

        expect(day.schedule.map((i) => i.source).toSet(), {
          AppDestination.calendar,
          AppDestination.tasks,
          AppDestination.fitness,
          AppDestination.meals,
        });
        final starts = day.schedule.map((i) => i.start).toList();
        expect([...starts]..sort(), starts, reason: 'in time order');
      },
    );

    test('high priority tasks come first', () async {
      final day = await _repo(TodayScenario.populated).fetch();

      final flags = day.tasks.map((t) => t.isHighPriority).toList();
      expect(flags, [true, true, false, false, false]);
    });

    test('a quiet day leaves the other sections empty', () async {
      final day = await _repo(TodayScenario.quietDay).fetch();

      expect(day.isEmpty, isFalse);
      expect(day.schedule, hasLength(1));
      expect(day.tasks, hasLength(2));
      expect(day.habits, hasLength(3));
      expect(day.habitsDone, 0);
      expect(day.meals, isEmpty);
      expect(day.budget, isNull);
      expect(day.nextWorkout, isNull);
      expect(day.suggestions, isEmpty);
    });

    test('a first run has nothing at all', () async {
      final day = await _repo(TodayScenario.firstRun).fetch();

      expect(day.isEmpty, isTrue);
    });

    test('the over-budget day is over budget, the busy day is not', () async {
      final busy = (await _repo(TodayScenario.populated).fetch()).budget!;
      final over = (await _repo(TodayScenario.overBudget).fetch()).budget!;

      expect(busy.isOver, isFalse);
      expect(busy.remaining, closeTo(211.60, 0.001));
      expect(over.isOver, isTrue);
      expect(over.remaining, closeTo(-31.20, 0.001));
    });

    test('the error scenario fails to load', () async {
      expect(
        _repo(TodayScenario.loadError).fetch(),
        throwsA(isA<TodayLoadException>()),
      );
    });

    test('the budget week counts down to Sunday', () async {
      final saturday = (await _repo(TodayScenario.populated).fetch()).budget!;
      expect(saturday.daysLeft, 2);

      final monday = await MockTodayRepository(
        scenario: TodayScenario.populated,
        now: DateTime(2026, 9, 21, 9),
        latency: Duration.zero,
      ).fetch();
      expect(monday.budget!.daysLeft, 7);
    });
  });

  group('models', () {
    test('a schedule item knows whether it is past, happening or upcoming', () {
      final item = ScheduleItem(
        id: 'x',
        title: 'x',
        start: DateTime(2026, 9, 26, 10),
        end: DateTime(2026, 9, 26, 11),
        source: AppDestination.calendar,
      );

      expect(
        item.statusAt(DateTime(2026, 9, 26, 9, 59)),
        ScheduleStatus.upcoming,
      );
      expect(
        item.statusAt(DateTime(2026, 9, 26, 10)),
        ScheduleStatus.happening,
      );
      expect(
        item.statusAt(DateTime(2026, 9, 26, 10, 59)),
        ScheduleStatus.happening,
      );
      expect(item.statusAt(DateTime(2026, 9, 26, 11)), ScheduleStatus.past);
    });

    test('the budget fraction stays within 0 and 1, even when over', () {
      const under = BudgetStatus(weeklyBudget: 400, spent: 100, daysLeft: 3);
      const over = BudgetStatus(weeklyBudget: 400, spent: 500, daysLeft: 3);
      const none = BudgetStatus(weeklyBudget: 0, spent: 50, daysLeft: 3);

      expect(under.fractionSpent, 0.25);
      expect(over.fractionSpent, 1);
      expect(none.fractionSpent, 0);
    });
  });

  group('changes', () {
    test('checking a task or a habit sticks, and can be undone', () async {
      final repo = _repo(TodayScenario.populated);

      var day = await repo.setTaskDone('t-invoice', done: true);
      expect(day.tasks.firstWhere((t) => t.id == 't-invoice').done, isTrue);
      expect(day.tasksOpen, 4);

      day = await repo.setHabitDone('h-read', done: true);
      expect(day.habitsDone, 3);

      day = await repo.setHabitDone('h-read', done: false);
      expect(day.habitsDone, 2);
    });

    test('a refresh returns what the user did, not the original day', () async {
      final repo = _repo(TodayScenario.populated);
      await repo.setTaskDone('t-invoice', done: true);
      await repo.add(
        const TaskEntry(
          title: 'Call Sam',
          due: TaskDue.today,
          isHighPriority: false,
        ),
      );

      final again = await repo.fetch();

      expect(again.tasks.firstWhere((t) => t.id == 't-invoice').done, isTrue);
      expect(again.tasks.map((t) => t.title), contains('Call Sam'));
    });

    test(
      'an event today joins the schedule in time order; one tomorrow does not',
      () async {
        final repo = _repo(TodayScenario.populated);

        var day = await repo.add(
          const EventEntry(
            title: 'Coffee',
            day: EntryDay.today,
            startMinutes: 11 * 60,
            durationMinutes: 30,
          ),
        );
        final titles = day.schedule.map((i) => i.title).toList();
        expect(
          titles.indexOf('Coffee'),
          titles.indexOf('Focus: Q4 planning outline') + 1,
        );
        expect(
          day.schedule.firstWhere((i) => i.title == 'Coffee').source,
          AppDestination.calendar,
        );

        day = await repo.add(
          const EventEntry(
            title: 'Tomorrow thing',
            day: EntryDay.tomorrow,
            startMinutes: 9 * 60,
            durationMinutes: 60,
          ),
        );
        expect(
          day.schedule.map((i) => i.title),
          isNot(contains('Tomorrow thing')),
        );
      },
    );

    test('a high priority task goes ahead of the normal ones, a normal one goes last', () async {
      final repo = _repo(TodayScenario.populated);

      var day = await repo.add(
        const TaskEntry(
          title: 'Urgent',
          due: TaskDue.today,
          isHighPriority: true,
        ),
      );
      expect(day.tasks.map((t) => t.title).toList().indexOf('Urgent'), 2);

      day = await repo.add(
        const TaskEntry(
          title: 'Whenever',
          due: TaskDue.today,
          isHighPriority: false,
        ),
      );
      expect(day.tasks.last.title, 'Whenever');

      day = await repo.add(
        const TaskEntry(
          title: 'Later',
          due: TaskDue.tomorrow,
          isHighPriority: false,
        ),
      );
      expect(day.tasks.map((t) => t.title), isNot(contains('Later')));
    });

    test(
      'a high priority task on a list of only high priority ones goes last',
      () async {
        final repo = _repo(TodayScenario.quietDay);
        await repo.add(
          const TaskEntry(title: 'A', due: TaskDue.today, isHighPriority: true),
        );

        final day = await repo.add(
          const TaskEntry(title: 'B', due: TaskDue.today, isHighPriority: true),
        );

        expect(day.tasks.map((t) => t.title).take(2), ['A', 'B']);
      },
    );

    test('a habit starts the day unchecked', () async {
      final day = await _repo(TodayScenario.quietDay).add(
        const HabitEntry(name: 'Stretch at lunch', cadence: HabitCadence.daily),
      );

      final habit = day.habits.last;
      expect(habit.title, 'Stretch at lunch');
      expect(habit.done, isFalse);
    });

    test('a logged workout is remembered', () async {
      final day = await _repo(TodayScenario.quietDay)
          .add(const WorkoutEntry(kind: WorkoutKind.run, minutes: 30));

      expect(day.loggedWorkouts.single.kind, WorkoutKind.run);
      expect(day.loggedWorkouts.single.minutes, 30);
    });

    test(
      'an expense counts against the week and re-ranks the categories',
      () async {
        final repo = _repo(TodayScenario.populated);

        final day = await repo.add(
          const ExpenseEntry(amount: 40, category: ExpenseCategory.dining),
        );

        final budget = day.budget!;
        expect(budget.spent, closeTo(228.40, 0.001));
        expect(budget.remaining, closeTo(171.60, 0.001));
        expect(budget.topCategories.first.category, ExpenseCategory.dining);
        expect(budget.topCategories.first.amount, closeTo(101.30, 0.001));
      },
    );

    test('an expense with no budget set changes nothing', () async {
      final repo = _repo(TodayScenario.quietDay);

      final day = await repo.add(
        const ExpenseEntry(amount: 40, category: ExpenseCategory.dining),
      );

      expect(day.budget, isNull);
    });

    test('a meal joins the day at a sensible time', () async {
      final day = await _repo(TodayScenario.quietDay)
          .add(const MealEntry(type: MealType.lunch, description: 'Soup'));

      final meal = day.meals.single;
      expect(meal.name, 'Soup');
      expect(meal.time, DateTime(2026, 9, 26, 12));
      expect(meal.logged, isFalse);
    });

    test('every kind of entry says what happened, without fuss', () {
      const entries = <QuickEntry>[
        EventEntry(
          title: 'a',
          day: EntryDay.today,
          startMinutes: 0,
          durationMinutes: 30,
        ),
        EventEntry(
          title: 'a',
          day: EntryDay.tomorrow,
          startMinutes: 0,
          durationMinutes: 30,
        ),
        TaskEntry(title: 'a', due: TaskDue.today, isHighPriority: false),
        TaskEntry(title: 'a', due: TaskDue.tomorrow, isHighPriority: false),
        HabitEntry(name: 'a', cadence: HabitCadence.daily),
        WorkoutEntry(kind: WorkoutKind.run, minutes: 30),
        ExpenseEntry(amount: 1, category: ExpenseCategory.other),
        MealEntry(type: MealType.snack, description: 'a'),
      ];

      expect(entries.map((e) => e.confirmation), [
        'Event added',
        'Event added for tomorrow',
        'Task added',
        'Task added for tomorrow',
        'Habit added',
        'Workout logged',
        'Expense logged',
        'Meal added',
      ]);
      expect(
        entries.map((e) => e.domain).toSet(),
        AppDestination.domains.toSet(),
      );
    });
  });

  group('controller', () {
    ProviderContainer containerFor(TodayRepository repo) {
      final container = ProviderContainer(
        overrides: [todayRepositoryProvider.overrideWithValue(repo)],
      );
      addTearDown(container.dispose);
      return container;
    }

    test('loads the day', () async {
      final container = containerFor(_repo(TodayScenario.populated));

      final day = await container.read(todayControllerProvider.future);

      expect(day.schedule, hasLength(6));
    });

    test('toggling and adding update the day', () async {
      final container = containerFor(_repo(TodayScenario.populated));
      await container.read(todayControllerProvider.future);
      final controller = container.read(todayControllerProvider.notifier);

      await controller.toggleHabit('h-read');
      expect(container.read(todayControllerProvider).value!.habitsDone, 3);

      await controller.toggleHabit('h-read');
      expect(container.read(todayControllerProvider).value!.habitsDone, 2);

      await controller.toggleTask('t-invoice');
      expect(container.read(todayControllerProvider).value!.tasksOpen, 4);

      await controller.add(
        const HabitEntry(name: 'New one', cadence: HabitCadence.daily),
      );
      expect(
        container.read(todayControllerProvider).value!.habits,
        hasLength(7),
      );
    });

    test('toggling something that is not there does nothing', () async {
      final container = containerFor(_repo(TodayScenario.populated));
      await container.read(todayControllerProvider.future);

      await container.read(todayControllerProvider.notifier).toggleTask('nope');
      await container
          .read(todayControllerProvider.notifier)
          .toggleHabit('nope');

      expect(container.read(todayControllerProvider).value!.tasksOpen, 5);
    });

    test('a refresh keeps the day showing while it reloads', () async {
      final container = containerFor(_repo(TodayScenario.populated));
      await container.read(todayControllerProvider.future);
      final seen = <AsyncValue<TodaySnapshot>>[];
      container.listen(todayControllerProvider, (_, next) => seen.add(next));

      await container.read(todayControllerProvider.notifier).refresh();

      expect(seen.first.isLoading, isTrue);
      expect(
        seen.first.value,
        isNotNull,
        reason: 'the old day stays on screen',
      );
      expect(seen.last.hasError, isFalse);
      expect(seen.last.value, isNotNull);
    });

    test('a failed refresh keeps the day and records the failure', () async {
      final container = containerFor(_FlakyRepository());
      await container.read(todayControllerProvider.future);
      expect(container.read(todayRefreshFailuresProvider), 0);

      await container.read(todayControllerProvider.notifier).refresh();

      final state = container.read(todayControllerProvider);
      expect(
        state.hasError,
        isFalse,
        reason: 'there is still a good day to show',
      );
      expect(state.value!.schedule, hasLength(6));
      expect(container.read(todayRefreshFailuresProvider), 1);

      await container.read(todayControllerProvider.notifier).refresh();
      expect(container.read(todayRefreshFailuresProvider), 2);
    });

    test('a refresh that fails with nothing to show stays an error', () async {
      final container = containerFor(_repo(TodayScenario.loadError));
      final sub = container.listen(todayControllerProvider, (_, _) {});
      addTearDown(sub.close);
      await expectLater(
        container.read(todayControllerProvider.future),
        throwsA(isA<TodayLoadException>()),
      );

      await container.read(todayControllerProvider.notifier).refresh();

      expect(container.read(todayControllerProvider).hasError, isTrue);
      expect(
        container.read(todayRefreshFailuresProvider),
        0,
        reason: 'not a failed refresh, a failed load',
      );
    });

    test('retrying after a failed load recovers once it works', () async {
      final container = containerFor(_FailsOnceRepository());
      final sub = container.listen(todayControllerProvider, (_, _) {});
      addTearDown(sub.close);
      await expectLater(
        container.read(todayControllerProvider.future),
        throwsA(isA<TodayLoadException>()),
      );

      await container.read(todayControllerProvider.notifier).refresh();

      final state = container.read(todayControllerProvider);
      expect(state.hasError, isFalse);
      expect(state.value!.schedule, hasLength(6));
    });

    test('a load that fails outright has an error and no day', () async {
      final container = containerFor(_repo(TodayScenario.loadError));
      final sub = container.listen(todayControllerProvider, (_, _) {});
      addTearDown(sub.close);

      await expectLater(
        container.read(todayControllerProvider.future),
        throwsA(isA<TodayLoadException>()),
      );

      expect(container.read(todayControllerProvider).hasError, isTrue);
      expect(container.read(todayControllerProvider).value, isNull);
    });

    test('changing the scenario reloads the day', () async {
      final container = ProviderContainer();
      addTearDown(container.dispose);
      final sub = container.listen(todayControllerProvider, (_, _) {});
      addTearDown(sub.close);

      container
          .read(todayScenarioProvider.notifier)
          .select(TodayScenario.firstRun);
      final day = await container.read(todayControllerProvider.future);

      expect(day.isEmpty, isTrue);
    });
  });
}
