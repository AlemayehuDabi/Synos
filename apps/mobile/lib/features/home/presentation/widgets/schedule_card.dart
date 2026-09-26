import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/navigation/app_destination.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/utils/formatters.dart';
import '../../../quick_add/presentation/quick_add_actions.dart';
import '../../data/models/today_models.dart';
import 'today_card.dart';

/// Today's time, in order: calendar events, and the blocks other domains have
/// put on the calendar (a task's focus time, a workout, a meal), each marked
/// with the accent of the domain it came from.
class ScheduleCard extends ConsumerWidget {
  const ScheduleCard({super.key, required this.snapshot});

  final TodaySnapshot snapshot;

  static const _maxRows = 5;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = snapshot.schedule;
    final now = snapshot.asOf;
    final shown = items.take(_maxRows).toList();

    // Point at what is on now, or failing that, what comes next.
    final happening = shown.indexWhere(
      (i) => i.statusAt(now) == ScheduleStatus.happening,
    );
    final next = happening != -1
        ? -1
        : shown.indexWhere((i) => i.statusAt(now) == ScheduleStatus.upcoming);

    return TodayCard(
      domain: AppDestination.calendar,
      title: 'Schedule',
      summary: items.isEmpty ? null : '${items.length} today',
      note: snapshot.notes[AppDestination.calendar],
      child: items.isEmpty
          ? SectionEmptyRow(
              message: 'Nothing scheduled today.',
              actionLabel: 'Add event',
              onAction: () => openQuickAdd(
                context,
                ref,
                initialDomain: AppDestination.calendar,
              ),
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (var i = 0; i < shown.length; i++)
                  _ScheduleRow(
                    item: shown[i],
                    status: shown[i].statusAt(now),
                    isNext: i == next,
                  ),
                if (items.length > shown.length)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton(
                      onPressed: () => context.go(AppDestination.calendar.path),
                      child: Text('View all ${items.length} in Calendar'),
                    ),
                  ),
              ],
            ),
    );
  }
}

class _ScheduleRow extends StatelessWidget {
  const _ScheduleRow({
    required this.item,
    required this.status,
    required this.isNext,
  });

  final ScheduleItem item;
  final ScheduleStatus status;
  final bool isNext;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurfaceVariant;
    final isPast = status == ScheduleStatus.past;
    final accent = item.source.accent ?? muted;
    final fromElsewhere = item.source != AppDestination.calendar;
    final meta =
        item.location ?? (fromElsewhere ? 'From ${item.source.label}' : null);
    // Times need room in proportion to the text size.
    final timeWidth = MediaQuery.textScalerOf(context)
        .scale(64)
        .clamp(64.0, 132.0);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxs),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              width: timeWidth,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    Formatters.time(context, item.start),
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: isPast ? muted : null,
                    ),
                  ),
                  Text(
                    Formatters.time(context, item.end),
                    style: theme.textTheme.bodySmall,
                  ),
                ],
              ),
            ),
            Container(
              width: 3,
              margin: const EdgeInsets.only(
                right: AppSpacing.xs + AppSpacing.xxs,
              ),
              decoration: BoxDecoration(
                color: accent.withValues(alpha: isPast ? 0.35 : 1),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxs),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.title,
                      style: theme.textTheme.bodyLarge?.copyWith(
                        color: isPast ? muted : null,
                        fontWeight: status == ScheduleStatus.happening
                            ? FontWeight.w600
                            : null,
                      ),
                    ),
                    if (meta != null)
                      Row(
                        children: [
                          if (fromElsewhere) ...[
                            Icon(item.source.icon, size: 13, color: accent),
                            const SizedBox(width: AppSpacing.xxs),
                          ],
                          Flexible(
                            child: Text(meta, style: theme.textTheme.bodySmall),
                          ),
                        ],
                      ),
                  ],
                ),
              ),
            ),
            if (status == ScheduleStatus.happening)
              const _Pill('Now', filled: true)
            else if (isNext)
              const _Pill('Next'),
          ],
        ),
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill(this.label, {this.filled = false});

  final String label;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = theme.colorScheme.secondary;

    return Align(
      alignment: Alignment.center,
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.xs,
          vertical: AppSpacing.xxs / 2,
        ),
        decoration: BoxDecoration(
          color: filled ? color.withValues(alpha: 0.14) : null,
          borderRadius: BorderRadius.circular(AppRadius.chip),
          border: Border.all(color: color.withValues(alpha: filled ? 0 : 0.5)),
        ),
        child: Text(
          label,
          style: theme.textTheme.labelSmall?.copyWith(
            color: color,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}
