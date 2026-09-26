import '../../../../core/navigation/app_destination.dart';

/// What a quick-add form hands back: one lightweight entry for one domain.
/// Sealed so anything that consumes it has to handle every domain.
sealed class QuickEntry {
  const QuickEntry();

  AppDestination get domain;

  /// What to tell the user once it is saved. Plain and short.
  String get confirmation;
}

enum EntryDay { today, tomorrow }

enum TaskDue { today, tomorrow, noDate }

enum HabitCadence { daily, weekdays, weekly }

enum WorkoutKind { strength, run, cycle, yoga, other }

enum ExpenseCategory { groceries, dining, transport, bills, other }

enum MealType { breakfast, lunch, dinner, snack }

class EventEntry extends QuickEntry {
  const EventEntry({
    required this.title,
    required this.day,
    required this.startMinutes,
    required this.durationMinutes,
  });

  final String title;
  final EntryDay day;

  /// Minutes after midnight.
  final int startMinutes;
  final int durationMinutes;

  @override
  AppDestination get domain => AppDestination.calendar;

  @override
  String get confirmation =>
      day == EntryDay.today ? 'Event added' : 'Event added for tomorrow';
}

class TaskEntry extends QuickEntry {
  const TaskEntry({
    required this.title,
    required this.due,
    required this.isHighPriority,
  });

  final String title;
  final TaskDue due;
  final bool isHighPriority;

  @override
  AppDestination get domain => AppDestination.tasks;

  @override
  String get confirmation =>
      due == TaskDue.tomorrow ? 'Task added for tomorrow' : 'Task added';
}

class HabitEntry extends QuickEntry {
  const HabitEntry({required this.name, required this.cadence});

  final String name;
  final HabitCadence cadence;

  @override
  AppDestination get domain => AppDestination.habits;

  @override
  String get confirmation => 'Habit added';
}

class WorkoutEntry extends QuickEntry {
  const WorkoutEntry({required this.kind, required this.minutes});

  final WorkoutKind kind;
  final int minutes;

  @override
  AppDestination get domain => AppDestination.fitness;

  @override
  String get confirmation => 'Workout logged';
}

class ExpenseEntry extends QuickEntry {
  const ExpenseEntry({required this.amount, required this.category, this.note});

  final double amount;
  final ExpenseCategory category;
  final String? note;

  @override
  AppDestination get domain => AppDestination.finance;

  @override
  String get confirmation => 'Expense logged';
}

class MealEntry extends QuickEntry {
  const MealEntry({required this.type, required this.description});

  final MealType type;
  final String description;

  @override
  AppDestination get domain => AppDestination.meals;

  @override
  String get confirmation => 'Meal added';
}

extension MealTypeLabel on MealType {
  String get label => switch (this) {
    MealType.breakfast => 'Breakfast',
    MealType.lunch => 'Lunch',
    MealType.dinner => 'Dinner',
    MealType.snack => 'Snack',
  };
}

extension WorkoutKindLabel on WorkoutKind {
  String get label => switch (this) {
    WorkoutKind.strength => 'Strength',
    WorkoutKind.run => 'Run',
    WorkoutKind.cycle => 'Cycle',
    WorkoutKind.yoga => 'Yoga',
    WorkoutKind.other => 'Other',
  };
}

extension ExpenseCategoryLabel on ExpenseCategory {
  String get label => switch (this) {
    ExpenseCategory.groceries => 'Groceries',
    ExpenseCategory.dining => 'Dining',
    ExpenseCategory.transport => 'Transport',
    ExpenseCategory.bills => 'Bills',
    ExpenseCategory.other => 'Other',
  };
}
