import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/navigation/app_destination.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../quick_add/presentation/quick_add_actions.dart';
import '../../application/today_controller.dart';
import '../../data/models/today_models.dart';
import 'today_card.dart';

/// Today's checklist. A streak is shown as a plain number of days; there is
/// nothing to lose here, so nothing is said about a day that wasn't checked.
class HabitsCard extends ConsumerWidget {
  const HabitsCard({super.key, required this.snapshot});

  final TodaySnapshot snapshot;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final habits = snapshot.habits;
    final accent = AppDestination.habits.accent!;
    final done = snapshot.habitsDone;

    return TodayCard(
      domain: AppDestination.habits,
      title: 'Habits',
      summary: habits.isEmpty ? null : '$done of ${habits.length}',
      child: habits.isEmpty
          ? SectionEmptyRow(
              message: 'No habits set up yet.',
              actionLabel: 'Add habit',
              onAction: () => openQuickAdd(
                context,
                ref,
                initialDomain: AppDestination.habits,
              ),
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Semantics(
                  label: '$done of ${habits.length} habits done',
                  excludeSemantics: true,
                  child: LinearProgressIndicator(
                    value: done / habits.length,
                    minHeight: 6,
                    borderRadius: BorderRadius.circular(3),
                    color: accent,
                    backgroundColor: accent.withValues(alpha: 0.14),
                  ),
                ),
                const SizedBox(height: AppSpacing.xs),
                for (final habit in habits)
                  CheckRow(
                    checked: habit.done,
                    color: accent,
                    title: habit.title,
                    strikeWhenChecked: false,
                    trailing: _streak(context, habit),
                    semanticDetail: habit.streakDays > 0
                        ? '${habit.streakDays}-day streak'
                        : null,
                    onToggle: () => ref
                        .read(todayControllerProvider.notifier)
                        .toggleHabit(habit.id),
                  ),
              ],
            ),
    );
  }

  static Widget? _streak(BuildContext context, HabitItem habit) {
    if (habit.streakDays == 0) return null;
    return Padding(
      padding: const EdgeInsets.only(left: AppSpacing.xs),
      child: Text(
        '${habit.streakDays}-day streak',
        style: Theme.of(context).textTheme.bodySmall,
      ),
    );
  }
}
