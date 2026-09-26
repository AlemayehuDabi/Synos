import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/navigation/app_destination.dart';
import '../../../quick_add/presentation/quick_add_actions.dart';
import '../../application/today_controller.dart';
import '../../data/models/today_models.dart';
import 'today_card.dart';

/// The few tasks worth doing today. Checking one off is instant and quiet.
/// An overdue task is just a task with an earlier date: no red, no alarm.
class PrioritiesCard extends ConsumerWidget {
  const PrioritiesCard({super.key, required this.snapshot});

  final TodaySnapshot snapshot;

  static const _maxRows = 5;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tasks = snapshot.tasks;
    final shown = tasks.take(_maxRows).toList();
    final accent = AppDestination.tasks.accent!;
    final open = snapshot.tasksOpen;

    return TodayCard(
      domain: AppDestination.tasks,
      title: 'Priorities',
      summary: tasks.isEmpty ? null : (open == 0 ? 'All done' : '$open open'),
      child: tasks.isEmpty
          ? SectionEmptyRow(
              message: 'No priority tasks for today.',
              actionLabel: 'Add task',
              onAction: () => openQuickAdd(
                context,
                ref,
                initialDomain: AppDestination.tasks,
              ),
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final task in shown)
                  CheckRow(
                    checked: task.done,
                    color: accent,
                    title: task.title,
                    subtitle: _subtitle(task),
                    onToggle: () => ref
                        .read(todayControllerProvider.notifier)
                        .toggleTask(task.id),
                  ),
                if (tasks.length > shown.length)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton(
                      onPressed: () => context.go(AppDestination.tasks.path),
                      child: Text('View all ${tasks.length} in Tasks'),
                    ),
                  ),
              ],
            ),
    );
  }

  static String? _subtitle(PriorityTask task) {
    if (!task.isHighPriority) return task.detail;
    return task.detail == null
        ? 'High priority'
        : 'High priority · ${task.detail}';
  }
}
