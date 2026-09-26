import '../../../../core/navigation/app_destination.dart';
import '../../../quick_add/data/models/quick_entry.dart';

enum ScheduleStatus { past, happening, upcoming }

/// One block on today's schedule. [source] is the domain it comes from: a
/// calendar event, or time another domain has put on the calendar (a task's
/// focus block, a workout, a meal).
class ScheduleItem {
  const ScheduleItem({
    required this.id,
    required this.title,
    required this.start,
    required this.end,
    required this.source,
    this.location,
  });

  final String id;
  final String title;
  final DateTime start;
  final DateTime end;
  final AppDestination source;
  final String? location;

  ScheduleStatus statusAt(DateTime now) {
    if (now.isBefore(start)) return ScheduleStatus.upcoming;
    if (now.isBefore(end)) return ScheduleStatus.happening;
    return ScheduleStatus.past;
  }
}

class PriorityTask {
  const PriorityTask({
    required this.id,
    required this.title,
    this.detail,
    this.isHighPriority = false,
    this.done = false,
  });

  final String id;
  final String title;

  /// One line of context: when it is due, how long it should take.
  final String? detail;
  final bool isHighPriority;
  final bool done;

  PriorityTask copyWith({bool? done}) => PriorityTask(
    id: id,
    title: title,
    detail: detail,
    isHighPriority: isHighPriority,
    done: done ?? this.done,
  );
}

class HabitItem {
  const HabitItem({
    required this.id,
    required this.title,
    this.streakDays = 0,
    this.isBreakHabit = false,
    this.done = false,
  });

  final String id;
  final String title;
  final int streakDays;

  /// A habit of avoiding something: "done" means a day without it.
  final bool isBreakHabit;
  final bool done;

  HabitItem copyWith({bool? done}) => HabitItem(
    id: id,
    title: title,
    streakDays: streakDays,
    isBreakHabit: isBreakHabit,
    done: done ?? this.done,
  );
}

class PlannedMeal {
  const PlannedMeal({
    required this.id,
    required this.type,
    required this.name,
    required this.time,
    this.kcal,
    this.logged = false,
  });

  final String id;
  final MealType type;
  final String name;
  final DateTime time;
  final int? kcal;
  final bool logged;
}

class CategorySpend {
  const CategorySpend(this.category, this.amount);

  final ExpenseCategory category;
  final double amount;
}

class BudgetStatus {
  const BudgetStatus({
    required this.weeklyBudget,
    required this.spent,
    required this.daysLeft,
    this.topCategories = const [],
  });

  final double weeklyBudget;
  final double spent;

  /// Days left in the budget week, today included.
  final int daysLeft;
  final List<CategorySpend> topCategories;

  double get remaining => weeklyBudget - spent;
  bool get isOver => spent > weeklyBudget;

  /// How much of the week's budget is used, 0 to 1.
  double get fractionSpent =>
      weeklyBudget <= 0 ? 0 : (spent / weeklyBudget).clamp(0.0, 1.0);

  BudgetStatus withExpense(ExpenseCategory category, double amount) {
    final totals = {for (final c in topCategories) c.category: c.amount};
    totals[category] = (totals[category] ?? 0) + amount;
    final sorted = totals.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    return BudgetStatus(
      weeklyBudget: weeklyBudget,
      spent: spent + amount,
      daysLeft: daysLeft,
      topCategories: [for (final e in sorted) CategorySpend(e.key, e.value)],
    );
  }
}

class NextWorkout {
  const NextWorkout({
    required this.id,
    required this.title,
    required this.start,
    required this.minutes,
    required this.summary,
    this.programLabel,
  });

  final String id;
  final String title;
  final DateTime start;
  final int minutes;
  final String summary;
  final String? programLabel;
}

class LoggedWorkout {
  const LoggedWorkout({required this.kind, required this.minutes});

  final WorkoutKind kind;
  final int minutes;
}

/// A pending cross-domain suggestion: something one domain noticed that
/// another could act on. [from] noticed it, [to] would change.
class Suggestion {
  const Suggestion({
    required this.id,
    required this.title,
    required this.detail,
    required this.from,
    required this.to,
  });

  final String id;
  final String title;
  final String detail;
  final AppDestination from;
  final AppDestination to;
}

/// A one-line note on where two domains touch, shown at the foot of a card.
class ConnectionNote {
  const ConnectionNote({
    required this.from,
    required this.to,
    required this.text,
  });

  final AppDestination from;
  final AppDestination to;
  final String text;
}

/// Everything the Today view shows, as of [asOf].
class TodaySnapshot {
  const TodaySnapshot({
    required this.asOf,
    this.schedule = const [],
    this.tasks = const [],
    this.habits = const [],
    this.meals = const [],
    this.budget,
    this.nextWorkout,
    this.loggedWorkouts = const [],
    this.suggestions = const [],
    this.notes = const {},
  });

  final DateTime asOf;
  final List<ScheduleItem> schedule;
  final List<PriorityTask> tasks;
  final List<HabitItem> habits;
  final List<PlannedMeal> meals;
  final BudgetStatus? budget;
  final NextWorkout? nextWorkout;
  final List<LoggedWorkout> loggedWorkouts;
  final List<Suggestion> suggestions;

  /// Keyed by the card the note appears on.
  final Map<AppDestination, ConnectionNote> notes;

  /// True before the user has set anything up in any domain.
  bool get isEmpty =>
      schedule.isEmpty &&
      tasks.isEmpty &&
      habits.isEmpty &&
      meals.isEmpty &&
      budget == null &&
      nextWorkout == null &&
      loggedWorkouts.isEmpty &&
      suggestions.isEmpty;

  int get habitsDone => habits.where((h) => h.done).length;
  int get tasksOpen => tasks.where((t) => !t.done).length;
  int get mealsLogged => meals.where((m) => m.logged).length;

  TodaySnapshot copyWith({
    List<ScheduleItem>? schedule,
    List<PriorityTask>? tasks,
    List<HabitItem>? habits,
    List<PlannedMeal>? meals,
    BudgetStatus? budget,
    List<LoggedWorkout>? loggedWorkouts,
  }) => TodaySnapshot(
    asOf: asOf,
    schedule: schedule ?? this.schedule,
    tasks: tasks ?? this.tasks,
    habits: habits ?? this.habits,
    meals: meals ?? this.meals,
    budget: budget ?? this.budget,
    nextWorkout: nextWorkout,
    loggedWorkouts: loggedWorkouts ?? this.loggedWorkouts,
    suggestions: suggestions,
    notes: notes,
  );
}
