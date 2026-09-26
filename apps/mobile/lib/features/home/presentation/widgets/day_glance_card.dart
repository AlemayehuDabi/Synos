import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/navigation/app_destination.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_shadows.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/utils/formatters.dart';
import '../../../quick_add/presentation/quick_add_sheet.dart';
import '../../data/models/today_models.dart';

/// The whole day in one row: one number per domain, each on the domain's
/// accent, each a way into that domain. Six areas, read at a glance, as one.
class DayGlanceCard extends StatelessWidget {
  const DayGlanceCard({super.key, required this.snapshot});

  final TodaySnapshot snapshot;

  static const _order = [
    AppDestination.calendar,
    AppDestination.tasks,
    AppDestination.habits,
    AppDestination.meals,
    AppDestination.finance,
    AppDestination.fitness,
  ];

  ({String value, String label, bool alert}) _stat(
    BuildContext context,
    AppDestination domain,
  ) {
    final s = snapshot;
    switch (domain) {
      case AppDestination.calendar:
        final events = s.schedule.where((i) => i.source == domain).length;
        return (value: '$events', label: 'Events', alert: false);
      case AppDestination.tasks:
        return (value: '${s.tasksOpen}', label: 'Tasks', alert: false);
      case AppDestination.habits:
        return (
          value: s.habits.isEmpty ? '–' : '${s.habitsDone}/${s.habits.length}',
          label: 'Habits',
          alert: false,
        );
      case AppDestination.meals:
        return (
          value: s.meals.isEmpty ? '–' : '${s.mealsLogged}/${s.meals.length}',
          label: 'Meals',
          alert: false,
        );
      case AppDestination.finance:
        final budget = s.budget;
        if (budget == null) return (value: '–', label: 'Left', alert: false);
        return budget.isOver
            ? (
                value: Formatters.money(-budget.remaining),
                label: 'Over',
                alert: true,
              )
            : (
                value: Formatters.money(budget.remaining),
                label: 'Left',
                alert: false,
              );
      case AppDestination.fitness:
        final next = s.nextWorkout;
        return (
          value: next == null ? '–' : Formatters.time(context, next.start),
          label: 'Workout',
          alert: false,
        );
      default:
        return (value: '–', label: domain.label, alert: false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final textScale = MediaQuery.textScalerOf(context).scale(1);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.cardTheme.color,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: theme.dividerColor),
        boxShadow: AppShadows.card,
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.xs,
          vertical: AppSpacing.xs + AppSpacing.xxs,
        ),
        child: LayoutBuilder(
          builder: (context, constraints) {
            // Six across when they fit, in two rows of three when they don't
            // (a narrow window, or large text).
            final minWidth = 56 * (textScale < 1 ? 1.0 : textScale);
            final perRow = (constraints.maxWidth / minWidth).floor() >= 6
                ? 6
                : 3;
            final width = constraints.maxWidth / perRow;

            return Wrap(
              children: [
                for (final domain in _order)
                  SizedBox(
                    width: width,
                    child: _GlanceStat(
                      domain: domain,
                      stat: _stat(context, domain),
                    ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _GlanceStat extends StatelessWidget {
  const _GlanceStat({required this.domain, required this.stat});

  final AppDestination domain;
  final ({String value, String label, bool alert}) stat;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final alertText = isDark ? AppColors.dangerOnDark : AppColors.danger;

    return Semantics(
      button: true,
      label: '${stat.label}: ${stat.value}',
      excludeSemantics: true,
      child: InkWell(
        onTap: () => context.go(domain.path),
        borderRadius: BorderRadius.circular(AppRadius.button),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxs),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DomainChip(domain: domain, size: 36),
              const SizedBox(height: AppSpacing.xxs),
              FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  stat.value,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: stat.alert ? alertText : null,
                  ),
                ),
              ),
              FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  stat.label,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: stat.alert ? alertText : null,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
