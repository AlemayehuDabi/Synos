import 'package:flutter/material.dart';

import '../../../core/navigation/app_destination.dart';
import '../../../core/theme/app_spacing.dart';

/// What quick add calls the thing each domain holds. (Finance's list is
/// "transactions", but what you capture in a moment is an expense.)
extension QuickAddNoun on AppDestination {
  String get quickAddNoun => switch (this) {
    AppDestination.calendar => 'Event',
    AppDestination.tasks => 'Task',
    AppDestination.habits => 'Habit',
    AppDestination.fitness => 'Workout',
    AppDestination.finance => 'Expense',
    AppDestination.meals => 'Meal',
    _ => label,
  };
}

/// A labelled row of single-choice chips, tinted with a domain's accent.
class ChoiceRow<T> extends StatelessWidget {
  const ChoiceRow({
    super.key,
    required this.label,
    required this.options,
    required this.value,
    required this.onChanged,
    required this.accent,
  });

  final String label;
  final Map<T, String> options;
  final T value;
  final ValueChanged<T> onChanged;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: theme.textTheme.labelMedium),
        const SizedBox(height: AppSpacing.xxs),
        Wrap(
          spacing: AppSpacing.xs,
          runSpacing: AppSpacing.xxs,
          children: [
            for (final option in options.entries)
              ChoiceChip(
                label: Text(option.value),
                selected: option.key == value,
                onSelected: (_) => onChanged(option.key),
                showCheckmark: false,
                selectedColor: accent.withValues(alpha: 0.16),
                side: BorderSide(
                  color: option.key == value ? accent : theme.dividerColor,
                ),
                labelStyle: theme.textTheme.labelMedium?.copyWith(
                  color: option.key == value
                      ? theme.colorScheme.onSurface
                      : theme.colorScheme.onSurfaceVariant,
                ),
              ),
          ],
        ),
      ],
    );
  }
}

/// A form field that shows a time and opens the time picker.
class TimeField extends StatelessWidget {
  const TimeField({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
  });

  final String label;
  final TimeOfDay value;
  final ValueChanged<TimeOfDay> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final text = MaterialLocalizations.of(context).formatTimeOfDay(
      value,
      alwaysUse24HourFormat: MediaQuery.alwaysUse24HourFormatOf(context),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: theme.textTheme.labelMedium),
        const SizedBox(height: AppSpacing.xxs),
        Material(
          color: theme.colorScheme.surface,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.input),
            side: BorderSide(color: theme.dividerColor),
          ),
          child: InkWell(
            borderRadius: BorderRadius.circular(AppRadius.input),
            onTap: () async {
              final picked = await showTimePicker(
                context: context,
                initialTime: value,
              );
              if (picked != null) onChanged(picked);
            },
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.sm,
                vertical: AppSpacing.sm - AppSpacing.xxs,
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.schedule_rounded,
                    size: 20,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                  const SizedBox(width: AppSpacing.xs),
                  Text(text, style: theme.textTheme.bodyLarge),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// The shared layout of a quick-add form: its fields, then one submit button.
class FormFrame extends StatelessWidget {
  const FormFrame({
    super.key,
    required this.formKey,
    required this.submitLabel,
    required this.onSubmit,
    required this.children,
  });

  final GlobalKey<FormState> formKey;
  final String submitLabel;
  final VoidCallback onSubmit;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Form(
      key: formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final child in children) ...[
            child,
            const SizedBox(height: AppSpacing.sm),
          ],
          const SizedBox(height: AppSpacing.xxs),
          FilledButton(
            onPressed: onSubmit,
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(52),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(AppRadius.button),
              ),
            ),
            child: Text(submitLabel),
          ),
        ],
      ),
    );
  }
}
