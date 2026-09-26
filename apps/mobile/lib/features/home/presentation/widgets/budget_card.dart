import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/navigation/app_destination.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/utils/formatters.dart';
import '../../../quick_add/data/models/quick_entry.dart';
import '../../../quick_add/presentation/quick_add_actions.dart';
import '../../data/models/today_models.dart';
import 'today_card.dart';

/// Spent against remaining for the budget week. This is the one place on the
/// dashboard that can turn red: going over a budget is a genuine alert, and
/// nothing else here is.
class BudgetCard extends ConsumerWidget {
  const BudgetCard({super.key, required this.snapshot});

  final TodaySnapshot snapshot;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final budget = snapshot.budget;

    return TodayCard(
      domain: AppDestination.finance,
      title: "This week's budget",
      summary: budget == null
          ? null
          : '${Formatters.plural(budget.daysLeft, 'day')} left',
      note: budget == null ? null : snapshot.notes[AppDestination.finance],
      child: budget == null
          ? SectionEmptyRow(
              message: 'No weekly budget set.',
              actionLabel: 'Set a budget',
              onAction: () => openQuickAdd(
                context,
                ref,
                initialDomain: AppDestination.finance,
              ),
            )
          : _BudgetBody(budget: budget),
    );
  }
}

class _BudgetBody extends StatelessWidget {
  const _BudgetBody({required this.budget});

  final BudgetStatus budget;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = AppDestination.finance.accent!;
    final isDark = theme.brightness == Brightness.dark;
    // Red text needs lifting on dark surfaces to stay readable.
    final alertText = isDark ? AppColors.dangerOnDark : AppColors.danger;
    final over = budget.isOver;
    final categories = budget.topCategories
        .take(2)
        .map((c) => '${c.category.label} ${Formatters.money(c.amount)}')
        .join(' · ');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            if (over) ...[
              Icon(Icons.error_outline_rounded, size: 20, color: alertText),
              const SizedBox(width: AppSpacing.xxs),
            ],
            Text(
              Formatters.money(over ? -budget.remaining : budget.remaining),
              style: theme.textTheme.headlineMedium?.copyWith(
                color: over ? alertText : null,
              ),
            ),
            const SizedBox(width: AppSpacing.xs),
            // What follows the amount gives way (ellipsis) before anything
            // overflows: large text, or a long amount.
            Flexible(
              child: Text(
                over ? 'over budget' : 'left',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: over ? alertText : theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
            Expanded(
              child: Text(
                'of ${Formatters.money(budget.weeklyBudget)}',
                textAlign: TextAlign.end,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodySmall,
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.xs),
        Semantics(
          label:
              '${Formatters.money(budget.spent)} spent of ${Formatters.money(budget.weeklyBudget)}',
          excludeSemantics: true,
          child: LinearProgressIndicator(
            value: budget.fractionSpent,
            minHeight: 6,
            borderRadius: BorderRadius.circular(3),
            color: over ? AppColors.danger : accent,
            backgroundColor: (over ? AppColors.danger : accent).withValues(
              alpha: 0.14,
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          [
            'Spent ${Formatters.money(budget.spent)}',
            if (categories.isNotEmpty) categories,
          ].join(' · '),
          style: theme.textTheme.bodySmall,
        ),
      ],
    );
  }
}
