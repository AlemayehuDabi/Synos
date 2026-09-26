import 'package:flutter/material.dart';

import '../../../../core/theme/app_spacing.dart';
import '../../../../core/utils/formatters.dart';
import '../../data/models/today_models.dart';
import 'budget_card.dart';
import 'day_glance_card.dart';
import 'habits_card.dart';
import 'inbox_preview_card.dart';
import 'meals_card.dart';
import 'priorities_card.dart';
import 'schedule_card.dart';
import 'workout_card.dart';

/// The Today view: the date, the whole day in one row, the inbox, then a card
/// per domain. One column on a phone, two once there is room.
class TodayDashboard extends StatelessWidget {
  const TodayDashboard({
    super.key,
    required this.snapshot,
    required this.onOpenInbox,
  });

  final TodaySnapshot snapshot;
  final VoidCallback onOpenInbox;

  /// Below this width the cards stack in one column.
  static const twoColumnBreakpoint = 680.0;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return ListView(
      // Always scrollable, so pull-to-refresh works on a short day too.
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.sm,
        AppSpacing.xs,
        AppSpacing.sm,
        AppInsets.fabClearance,
      ),
      children: [
        Text(
          Formatters.dayHeading(snapshot.asOf),
          style: theme.textTheme.headlineMedium,
        ),
        Text(
          'Updated ${Formatters.time(context, snapshot.asOf)}',
          style: theme.textTheme.bodySmall,
        ),
        const SizedBox(height: AppSpacing.sm),
        DayGlanceCard(key: const Key('day-glance'), snapshot: snapshot),
        if (snapshot.suggestions.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.sm),
          InboxPreviewCard(
            key: const Key('inbox-preview'),
            suggestions: snapshot.suggestions,
            onTap: onOpenInbox,
          ),
        ],
        const SizedBox(height: AppSpacing.sm),
        _Sections(snapshot: snapshot),
      ],
    );
  }
}

class _Sections extends StatelessWidget {
  const _Sections({required this.snapshot});

  final TodaySnapshot snapshot;

  @override
  Widget build(BuildContext context) {
    final schedule = ScheduleCard(
      key: const Key('card-schedule'),
      snapshot: snapshot,
    );
    final priorities = PrioritiesCard(
      key: const Key('card-priorities'),
      snapshot: snapshot,
    );
    final habits = HabitsCard(
      key: const Key('card-habits'),
      snapshot: snapshot,
    );
    final meals = MealsCard(key: const Key('card-meals'), snapshot: snapshot);
    final budget = BudgetCard(
      key: const Key('card-budget'),
      snapshot: snapshot,
    );
    final workout = WorkoutCard(
      key: const Key('card-workout'),
      snapshot: snapshot,
    );

    Widget column(List<Widget> cards) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < cards.length; i++) ...[
          if (i > 0) const SizedBox(height: AppSpacing.sm),
          cards[i],
        ],
      ],
    );

    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth < TodayDashboard.twoColumnBreakpoint) {
          return column([schedule, priorities, habits, meals, budget, workout]);
        }
        // Time and money down one side, things to do down the other.
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: column([schedule, meals, budget])),
            const SizedBox(width: AppSpacing.sm),
            Expanded(child: column([priorities, habits, workout])),
          ],
        );
      },
    );
  }
}
