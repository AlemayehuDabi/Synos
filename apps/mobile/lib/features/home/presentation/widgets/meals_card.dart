import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/navigation/app_destination.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/utils/formatters.dart';
import '../../../quick_add/data/models/quick_entry.dart';
import '../../../quick_add/presentation/quick_add_actions.dart';
import '../../data/models/today_models.dart';
import 'today_card.dart';

/// What is planned to eat today, with what has been logged marked off.
class MealsCard extends ConsumerWidget {
  const MealsCard({super.key, required this.snapshot});

  final TodaySnapshot snapshot;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final meals = snapshot.meals;

    return TodayCard(
      domain: AppDestination.meals,
      title: 'Meals',
      summary: meals.isEmpty
          ? null
          : '${snapshot.mealsLogged} of ${meals.length} logged',
      child: meals.isEmpty
          ? SectionEmptyRow(
              message: 'No meals planned for today.',
              actionLabel: 'Plan a meal',
              onAction: () => openQuickAdd(
                context,
                ref,
                initialDomain: AppDestination.meals,
              ),
            )
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [for (final meal in meals) _MealRow(meal: meal)],
            ),
    );
  }
}

class _MealRow extends StatelessWidget {
  const _MealRow({required this.meal});

  final PlannedMeal meal;

  static IconData _icon(MealType type) => switch (type) {
    MealType.breakfast => Icons.free_breakfast_outlined,
    MealType.lunch => Icons.rice_bowl_outlined,
    MealType.dinner => Icons.ramen_dining_outlined,
    MealType.snack => Icons.cookie_outlined,
  };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = AppDestination.meals.accent!;
    final details = [
      meal.type.label,
      Formatters.time(context, meal.time),
      if (meal.kcal != null) '${meal.kcal} kcal',
    ].join(' · ');

    return Semantics(
      label: '${meal.name}, $details${meal.logged ? ', logged' : ''}',
      excludeSemantics: true,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: AppSpacing.xxl),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxs),
          child: Row(
            children: [
              Container(
                width: AppSpacing.lg,
                height: AppSpacing.lg,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(AppRadius.button - 2),
                ),
                child: Icon(_icon(meal.type), size: 18, color: accent),
              ),
              const SizedBox(width: AppSpacing.sm - AppSpacing.xxs),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(meal.name, style: theme.textTheme.bodyLarge),
                    Text(details, style: theme.textTheme.bodySmall),
                  ],
                ),
              ),
              if (meal.logged)
                Icon(Icons.check_circle_rounded, size: 20, color: accent),
            ],
          ),
        ),
      ),
    );
  }
}
