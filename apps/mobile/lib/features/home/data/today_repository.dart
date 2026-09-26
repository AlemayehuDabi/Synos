import '../../../core/navigation/app_destination.dart';
import '../../quick_add/data/models/quick_entry.dart';
import 'mock_today_data.dart';
import 'models/today_models.dart';

/// Where the Today view gets its data. The UI only depends on this
/// interface: swap [MockTodayRepository] for one backed by the API through
/// `todayRepositoryProvider`, and nothing on screen changes.
///
/// The mutating calls return the whole updated day, so the caller never has
/// to guess what the server made of them.
abstract class TodayRepository {
  Future<TodaySnapshot> fetch();

  Future<TodaySnapshot> setTaskDone(String id, {required bool done});

  Future<TodaySnapshot> setHabitDone(String id, {required bool done});

  Future<TodaySnapshot> add(QuickEntry entry);
}

class TodayLoadException implements Exception {
  const TodayLoadException([this.message = 'Could not load today.']);

  final String message;

  @override
  String toString() => message;
}

/// Serves a made-up day for [scenario] and keeps whatever the user does to
/// it in memory, so a refresh returns their changes rather than resetting.
class MockTodayRepository implements TodayRepository {
  MockTodayRepository({
    required this.scenario,
    required this.now,
    this.latency = const Duration(milliseconds: 600),
  });

  final TodayScenario scenario;
  final DateTime now;

  /// How long [fetch] takes, so the loading and refreshing states are
  /// visible. Changes are instant.
  final Duration latency;

  TodaySnapshot? _day;

  TodaySnapshot get _current => _day ??= buildMockToday(scenario, now);

  @override
  Future<TodaySnapshot> fetch() async {
    await Future<void>.delayed(latency);
    if (scenario == TodayScenario.loadError) throw const TodayLoadException();
    return _current;
  }

  @override
  Future<TodaySnapshot> setTaskDone(String id, {required bool done}) async {
    return _day = _current.copyWith(
      tasks: [
        for (final task in _current.tasks)
          task.id == id ? task.copyWith(done: done) : task,
      ],
    );
  }

  @override
  Future<TodaySnapshot> setHabitDone(String id, {required bool done}) async {
    return _day = _current.copyWith(
      habits: [
        for (final habit in _current.habits)
          habit.id == id ? habit.copyWith(done: done) : habit,
      ],
    );
  }

  @override
  Future<TodaySnapshot> add(QuickEntry entry) async {
    final day = _current;
    return _day = switch (entry) {
      EventEntry() => _addEvent(day, entry),
      TaskEntry() => _addTask(day, entry),
      HabitEntry() => day.copyWith(
        habits: [
          ...day.habits,
          HabitItem(id: _newId('h'), title: entry.name),
        ],
      ),
      WorkoutEntry() => day.copyWith(
        loggedWorkouts: [
          ...day.loggedWorkouts,
          LoggedWorkout(kind: entry.kind, minutes: entry.minutes),
        ],
      ),
      ExpenseEntry() => _addExpense(day, entry),
      MealEntry() => _addMeal(day, entry),
    };
  }

  // Only what lands on today changes today's view; an event or task added
  // for tomorrow is saved but not shown here.
  TodaySnapshot _addEvent(TodaySnapshot day, EventEntry entry) {
    if (entry.day != EntryDay.today) return day;
    final start = DateTime(
      now.year,
      now.month,
      now.day,
    ).add(Duration(minutes: entry.startMinutes));
    return day.copyWith(
      schedule: [
        ...day.schedule,
        ScheduleItem(
          id: _newId('ev'),
          title: entry.title,
          start: start,
          end: start.add(Duration(minutes: entry.durationMinutes)),
          source: AppDestination.calendar,
        ),
      ]..sort((a, b) => a.start.compareTo(b.start)),
    );
  }

  TodaySnapshot _addTask(TodaySnapshot day, TaskEntry entry) {
    if (entry.due != TaskDue.today) return day;
    final task = PriorityTask(
      id: _newId('t'),
      title: entry.title,
      detail: 'Due today',
      isHighPriority: entry.isHighPriority,
    );
    // High priority goes ahead of everything that isn't.
    final firstNormal = day.tasks.indexWhere((t) => !t.isHighPriority);
    final index = !entry.isHighPriority
        ? day.tasks.length
        : firstNormal == -1
        ? day.tasks.length
        : firstNormal;
    return day.copyWith(tasks: [...day.tasks]..insert(index, task));
  }

  TodaySnapshot _addExpense(TodaySnapshot day, ExpenseEntry entry) {
    final budget = day.budget;
    if (budget == null) return day; // no budget to count it against
    return day.copyWith(
      budget: budget.withExpense(entry.category, entry.amount),
    );
  }

  TodaySnapshot _addMeal(TodaySnapshot day, MealEntry entry) {
    final hour = switch (entry.type) {
      MealType.breakfast => 8,
      MealType.lunch => 12,
      MealType.snack => 16,
      MealType.dinner => 19,
    };
    return day.copyWith(
      meals: [
        ...day.meals,
        PlannedMeal(
          id: _newId('m'),
          type: entry.type,
          name: entry.description,
          time: DateTime(now.year, now.month, now.day, hour),
        ),
      ]..sort((a, b) => a.time.compareTo(b.time)),
    );
  }

  int _counter = 0;
  String _newId(String prefix) => 'new-$prefix-${_counter++}';
}
