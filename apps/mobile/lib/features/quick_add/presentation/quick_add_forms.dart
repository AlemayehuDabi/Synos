import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/navigation/app_destination.dart';
import '../../../core/utils/validators.dart';
import '../../../core/widgets/text_input_field.dart';
import '../data/models/quick_entry.dart';
import 'quick_add_widgets.dart';

typedef EntrySubmitted = ValueChanged<QuickEntry>;

/// The lightweight form for [domain]: the few fields worth asking for in the
/// moment, nothing more. Each hands back a [QuickEntry] through [onSubmit].
Widget quickAddFormFor(AppDestination domain, EntrySubmitted onSubmit) {
  return switch (domain) {
    AppDestination.calendar => EventForm(onSubmit: onSubmit),
    AppDestination.tasks => TaskForm(onSubmit: onSubmit),
    AppDestination.habits => HabitForm(onSubmit: onSubmit),
    AppDestination.fitness => WorkoutForm(onSubmit: onSubmit),
    AppDestination.finance => ExpenseForm(onSubmit: onSubmit),
    AppDestination.meals => MealForm(onSubmit: onSubmit),
    _ => throw ArgumentError('${domain.name} has no quick-add form'),
  };
}

class EventForm extends StatefulWidget {
  const EventForm({super.key, required this.onSubmit});

  final EntrySubmitted onSubmit;

  @override
  State<EventForm> createState() => _EventFormState();
}

class _EventFormState extends State<EventForm> {
  final _formKey = GlobalKey<FormState>();
  final _title = TextEditingController();
  var _day = EntryDay.today;
  var _duration = 60;
  // The next full hour, so the default is usually a sensible time to add.
  late TimeOfDay _start = TimeOfDay(
    hour: (DateTime.now().hour + 1).clamp(0, 23),
    minute: 0,
  );

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    widget.onSubmit(
      EventEntry(
        title: _title.text.trim(),
        day: _day,
        startMinutes: _start.hour * 60 + _start.minute,
        durationMinutes: _duration,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final accent = AppDestination.calendar.accent!;

    return FormFrame(
      formKey: _formKey,
      submitLabel: 'Add event',
      onSubmit: _submit,
      children: [
        TextInputField(
          label: 'Title',
          controller: _title,
          hintText: 'Lunch with Sam',
          textInputAction: TextInputAction.done,
          validator: (v) => Validators.required(v, message: 'Enter a title'),
          onFieldSubmitted: (_) => _submit(),
        ),
        ChoiceRow<EntryDay>(
          label: 'Day',
          accent: accent,
          value: _day,
          options: const {
            EntryDay.today: 'Today',
            EntryDay.tomorrow: 'Tomorrow',
          },
          onChanged: (v) => setState(() => _day = v),
        ),
        TimeField(
          label: 'Starts',
          value: _start,
          onChanged: (v) => setState(() => _start = v),
        ),
        ChoiceRow<int>(
          label: 'Length',
          accent: accent,
          value: _duration,
          options: const {30: '30 min', 60: '1 hour', 120: '2 hours'},
          onChanged: (v) => setState(() => _duration = v),
        ),
      ],
    );
  }
}

class TaskForm extends StatefulWidget {
  const TaskForm({super.key, required this.onSubmit});

  final EntrySubmitted onSubmit;

  @override
  State<TaskForm> createState() => _TaskFormState();
}

class _TaskFormState extends State<TaskForm> {
  final _formKey = GlobalKey<FormState>();
  final _title = TextEditingController();
  var _due = TaskDue.today;
  var _highPriority = false;

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    widget.onSubmit(
      TaskEntry(
        title: _title.text.trim(),
        due: _due,
        isHighPriority: _highPriority,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final accent = AppDestination.tasks.accent!;

    return FormFrame(
      formKey: _formKey,
      submitLabel: 'Add task',
      onSubmit: _submit,
      children: [
        TextInputField(
          label: 'Title',
          controller: _title,
          hintText: 'Send the invoice',
          textInputAction: TextInputAction.done,
          validator: (v) => Validators.required(v, message: 'Enter a title'),
          onFieldSubmitted: (_) => _submit(),
        ),
        ChoiceRow<TaskDue>(
          label: 'Due',
          accent: accent,
          value: _due,
          options: const {
            TaskDue.today: 'Today',
            TaskDue.tomorrow: 'Tomorrow',
            TaskDue.noDate: 'No date',
          },
          onChanged: (v) => setState(() => _due = v),
        ),
        ChoiceRow<bool>(
          label: 'Priority',
          accent: accent,
          value: _highPriority,
          options: const {false: 'Normal', true: 'High'},
          onChanged: (v) => setState(() => _highPriority = v),
        ),
      ],
    );
  }
}

class HabitForm extends StatefulWidget {
  const HabitForm({super.key, required this.onSubmit});

  final EntrySubmitted onSubmit;

  @override
  State<HabitForm> createState() => _HabitFormState();
}

class _HabitFormState extends State<HabitForm> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  var _cadence = HabitCadence.daily;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    widget.onSubmit(HabitEntry(name: _name.text.trim(), cadence: _cadence));
  }

  @override
  Widget build(BuildContext context) {
    return FormFrame(
      formKey: _formKey,
      submitLabel: 'Add habit',
      onSubmit: _submit,
      children: [
        TextInputField(
          label: 'Habit',
          controller: _name,
          hintText: 'Read for 20 minutes',
          textInputAction: TextInputAction.done,
          validator: (v) => Validators.required(v, message: 'Enter a name'),
          onFieldSubmitted: (_) => _submit(),
        ),
        ChoiceRow<HabitCadence>(
          label: 'How often',
          accent: AppDestination.habits.accent!,
          value: _cadence,
          options: const {
            HabitCadence.daily: 'Every day',
            HabitCadence.weekdays: 'Weekdays',
            HabitCadence.weekly: 'Once a week',
          },
          onChanged: (v) => setState(() => _cadence = v),
        ),
      ],
    );
  }
}

class WorkoutForm extends StatefulWidget {
  const WorkoutForm({super.key, required this.onSubmit});

  final EntrySubmitted onSubmit;

  @override
  State<WorkoutForm> createState() => _WorkoutFormState();
}

class _WorkoutFormState extends State<WorkoutForm> {
  final _formKey = GlobalKey<FormState>();
  var _kind = WorkoutKind.strength;
  var _minutes = 30;

  @override
  Widget build(BuildContext context) {
    final accent = AppDestination.fitness.accent!;

    return FormFrame(
      formKey: _formKey,
      submitLabel: 'Log workout',
      onSubmit: () =>
          widget.onSubmit(WorkoutEntry(kind: _kind, minutes: _minutes)),
      children: [
        ChoiceRow<WorkoutKind>(
          label: 'Type',
          accent: accent,
          value: _kind,
          options: const {
            WorkoutKind.strength: 'Strength',
            WorkoutKind.run: 'Run',
            WorkoutKind.cycle: 'Cycle',
            WorkoutKind.yoga: 'Yoga',
            WorkoutKind.other: 'Other',
          },
          onChanged: (v) => setState(() => _kind = v),
        ),
        ChoiceRow<int>(
          label: 'Duration',
          accent: accent,
          value: _minutes,
          options: const {
            15: '15 min',
            30: '30 min',
            45: '45 min',
            60: '1 hour',
          },
          onChanged: (v) => setState(() => _minutes = v),
        ),
      ],
    );
  }
}

class ExpenseForm extends StatefulWidget {
  const ExpenseForm({super.key, required this.onSubmit});

  final EntrySubmitted onSubmit;

  @override
  State<ExpenseForm> createState() => _ExpenseFormState();
}

class _ExpenseFormState extends State<ExpenseForm> {
  final _formKey = GlobalKey<FormState>();
  final _amount = TextEditingController();
  final _note = TextEditingController();
  var _category = ExpenseCategory.groceries;

  @override
  void dispose() {
    _amount.dispose();
    _note.dispose();
    super.dispose();
  }

  static double? _parse(String? text) =>
      double.tryParse((text ?? '').trim().replaceAll(',', ''));

  String? _validateAmount(String? value) {
    final amount = _parse(value);
    if (amount == null || amount <= 0 || !amount.isFinite) {
      return 'Enter an amount greater than 0';
    }
    return null;
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    final note = _note.text.trim();
    widget.onSubmit(
      ExpenseEntry(
        amount: _parse(_amount.text)!,
        category: _category,
        note: note.isEmpty ? null : note,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return FormFrame(
      formKey: _formKey,
      submitLabel: 'Log expense',
      onSubmit: _submit,
      children: [
        TextInputField(
          label: 'Amount',
          controller: _amount,
          hintText: '0.00',
          prefixIcon: Icons.attach_money_rounded,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: [
            FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]')),
          ],
          textInputAction: TextInputAction.next,
          validator: _validateAmount,
        ),
        ChoiceRow<ExpenseCategory>(
          label: 'Category',
          accent: AppDestination.finance.accent!,
          value: _category,
          options: const {
            ExpenseCategory.groceries: 'Groceries',
            ExpenseCategory.dining: 'Dining',
            ExpenseCategory.transport: 'Transport',
            ExpenseCategory.bills: 'Bills',
            ExpenseCategory.other: 'Other',
          },
          onChanged: (v) => setState(() => _category = v),
        ),
        TextInputField(
          label: 'Note (optional)',
          controller: _note,
          textInputAction: TextInputAction.done,
          onFieldSubmitted: (_) => _submit(),
        ),
      ],
    );
  }
}

class MealForm extends StatefulWidget {
  const MealForm({super.key, required this.onSubmit});

  final EntrySubmitted onSubmit;

  @override
  State<MealForm> createState() => _MealFormState();
}

class _MealFormState extends State<MealForm> {
  final _formKey = GlobalKey<FormState>();
  final _description = TextEditingController();
  late MealType _type = _mealTypeFor(DateTime.now());

  // The meal it is most likely to be for, at this time of day.
  static MealType _mealTypeFor(DateTime now) {
    if (now.hour < 11) return MealType.breakfast;
    if (now.hour < 15) return MealType.lunch;
    if (now.hour < 17) return MealType.snack;
    return MealType.dinner;
  }

  @override
  void dispose() {
    _description.dispose();
    super.dispose();
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    widget.onSubmit(
      MealEntry(type: _type, description: _description.text.trim()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return FormFrame(
      formKey: _formKey,
      submitLabel: 'Add meal',
      onSubmit: _submit,
      children: [
        ChoiceRow<MealType>(
          label: 'Meal',
          accent: AppDestination.meals.accent!,
          value: _type,
          options: const {
            MealType.breakfast: 'Breakfast',
            MealType.lunch: 'Lunch',
            MealType.dinner: 'Dinner',
            MealType.snack: 'Snack',
          },
          onChanged: (v) => setState(() => _type = v),
        ),
        TextInputField(
          label: 'What is it?',
          controller: _description,
          hintText: 'Lentil soup',
          textInputAction: TextInputAction.done,
          validator: (v) =>
              Validators.required(v, message: 'Describe the meal'),
          onFieldSubmitted: (_) => _submit(),
        ),
      ],
    );
  }
}
