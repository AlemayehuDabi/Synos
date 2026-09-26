import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/navigation/app_destination.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/utils/formatters.dart';
import '../../../quick_add/data/models/quick_entry.dart';
import '../../../quick_add/presentation/quick_add_actions.dart';
import '../../data/models/today_models.dart';
import 'today_card.dart';

/// The next scheduled workout, and anything already logged today. A day with
/// nothing scheduled is a rest day, said plainly.
class WorkoutCard extends ConsumerWidget {
  const WorkoutCard({super.key, required this.snapshot});

  final TodaySnapshot snapshot;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final next = snapshot.nextWorkout;
    final logged = snapshot.loggedWorkouts;
    final accent = AppDestination.fitness.accent!;
    final theme = Theme.of(context);

    return TodayCard(
      domain: AppDestination.fitness,
      title: 'Next workout',
      summary: next == null ? null : Formatters.time(context, next.start),
      note: next == null ? null : snapshot.notes[AppDestination.fitness],
      onOpen: next == null
          ? null
          : () => context.go(AppDestination.fitness.detailPath(next.id)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (next != null)
            _NextWorkout(next: next)
          else if (logged.isEmpty)
            SectionEmptyRow(
              message: 'Rest day. Nothing is scheduled.',
              actionLabel: 'Log a workout',
              onAction: () => openQuickAdd(
                context,
                ref,
                initialDomain: AppDestination.fitness,
              ),
            ),
          if (logged.isNotEmpty) ...[
            if (next != null) const SizedBox(height: AppSpacing.xs),
            Text('Logged today', style: theme.textTheme.labelMedium),
            for (final workout in logged)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.xxs),
                child: Row(
                  children: [
                    Icon(Icons.check_circle_rounded, size: 18, color: accent),
                    const SizedBox(width: AppSpacing.xs),
                    Text(
                      '${workout.kind.label} · ${Formatters.duration(workout.minutes)}',
                      style: theme.textTheme.bodyLarge,
                    ),
                  ],
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class _NextWorkout extends StatelessWidget {
  const _NextWorkout({required this.next});

  final NextWorkout next;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return InkWell(
      onTap: () => context.go(AppDestination.fitness.detailPath(next.id)),
      borderRadius: BorderRadius.circular(AppRadius.button),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(next.title, style: theme.textTheme.titleMedium),
          Text(
            '${Formatters.time(context, next.start)} · ${Formatters.duration(next.minutes)}',
            style: theme.textTheme.bodyMedium,
          ),
          if (next.programLabel != null)
            Text(next.programLabel!, style: theme.textTheme.bodySmall),
          const SizedBox(height: AppSpacing.xxs),
          Text(next.summary, style: theme.textTheme.bodySmall),
        ],
      ),
    );
  }
}
