import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/navigation/app_destination.dart';
import '../../../../core/theme/app_shadows.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../quick_add/presentation/quick_add_sheet.dart';
import '../../data/models/today_models.dart';

/// The one card every section of the Today view is built from. Six domains,
/// one look: the same surface, the same header (the domain's icon on a tint
/// of its accent, a title, a short summary), the same padding, and at the
/// foot, where two domains touch, a one-line note naming both.
class TodayCard extends StatelessWidget {
  const TodayCard({
    super.key,
    required this.domain,
    required this.title,
    required this.child,
    this.summary,
    this.note,
    this.onOpen,
  });

  final AppDestination domain;
  final String title;
  final String? summary;
  final Widget child;
  final ConnectionNote? note;

  /// Where tapping the header goes. Defaults to the domain's own tab.
  final VoidCallback? onOpen;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.cardTheme.color,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: theme.dividerColor),
        boxShadow: AppShadows.card,
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppRadius.card - 1),
        child: Material(
          type: MaterialType.transparency,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _CardHeader(
                domain: domain,
                title: title,
                summary: summary,
                onTap: onOpen ?? () => context.go(domain.path),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.sm,
                  0,
                  AppSpacing.sm,
                  AppSpacing.sm,
                ),
                child: child,
              ),
              if (note != null) ConnectionNoteRow(note: note!),
            ],
          ),
        ),
      ),
    );
  }
}

class _CardHeader extends StatelessWidget {
  const _CardHeader({
    required this.domain,
    required this.title,
    required this.onTap,
    this.summary,
  });

  final AppDestination domain;
  final String title;
  final String? summary;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Semantics(
      button: true,
      hint: 'Opens ${domain.label}',
      child: InkWell(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppSpacing.xxl + 8),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.sm,
              AppSpacing.xs,
              AppSpacing.xs + AppSpacing.xxs,
              AppSpacing.xs,
            ),
            child: LayoutBuilder(
              builder: (context, constraints) => Row(
                children: [
                  DomainChip(domain: domain, size: 32),
                  const SizedBox(width: AppSpacing.xs + AppSpacing.xxs),
                  Expanded(
                    child: Text(
                      title,
                      style: theme.textTheme.titleMedium,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  if (summary != null) ...[
                    const SizedBox(width: AppSpacing.xs),
                    // At most two fifths of the row, so a large text size
                    // shortens the summary before it crowds out the title.
                    ConstrainedBox(
                      constraints: BoxConstraints(
                        maxWidth: constraints.maxWidth * 0.4,
                      ),
                      child: Text(
                        summary!,
                        style: theme.textTheme.bodySmall,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                  Icon(
                    Icons.chevron_right_rounded,
                    size: 20,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Small overlapping accent dots, one per domain: "this, and that".
class DomainDots extends StatelessWidget {
  const DomainDots({super.key, required this.domains, this.dot = 12});

  final List<AppDestination> domains;
  final double dot;

  static const _overlap = 0.6;

  @override
  Widget build(BuildContext context) {
    final surface = Theme.of(context).cardTheme.color;
    final fallback = Theme.of(context).colorScheme.onSurfaceVariant;

    return ExcludeSemantics(
      child: SizedBox(
        width: dot + dot * _overlap * (domains.length - 1),
        height: dot,
        child: Stack(
          children: [
            for (var i = 0; i < domains.length; i++)
              Positioned(
                left: dot * _overlap * i,
                child: Container(
                  width: dot,
                  height: dot,
                  decoration: BoxDecoration(
                    color: domains[i].accent ?? fallback,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: surface ?? Colors.transparent,
                      width: 1.5,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// The line at the foot of a card where one domain has shaped another.
class ConnectionNoteRow extends StatelessWidget {
  const ConnectionNoteRow({super.key, required this.note});

  final ConnectionNote note;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: theme.dividerColor)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.sm,
          vertical: AppSpacing.xs + AppSpacing.xxs,
        ),
        child: Row(
          children: [
            DomainDots(domains: [note.from, note.to]),
            const SizedBox(width: AppSpacing.xs),
            Expanded(child: Text(note.text, style: theme.textTheme.bodySmall)),
          ],
        ),
      ),
    );
  }
}

/// A round, tappable check: empty outline, or filled with the domain's
/// accent once done. Deliberately plain: no burst, no confetti.
class CheckCircle extends StatelessWidget {
  const CheckCircle({
    super.key,
    required this.checked,
    required this.color,
    this.size = 24,
  });

  final bool checked;
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return AnimatedContainer(
      duration: const Duration(milliseconds: 150),
      curve: Curves.easeOut,
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: checked ? color : Colors.transparent,
        border: Border.all(
          color: checked
              ? color
              : theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.55),
          width: 1.5,
        ),
      ),
      child: checked
          ? Icon(Icons.check_rounded, size: size * 0.66, color: Colors.white)
          : null,
    );
  }
}

/// A row with a [CheckCircle], a title and a line beneath it. Tapping
/// anywhere on the row toggles it.
class CheckRow extends StatelessWidget {
  const CheckRow({
    super.key,
    required this.checked,
    required this.color,
    required this.title,
    required this.onToggle,
    this.subtitle,
    this.trailing,
    this.semanticDetail,
    this.strikeWhenChecked = true,
  });

  final bool checked;
  final Color color;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback onToggle;

  /// What a screen reader adds after the title when there is no [subtitle]
  /// (the [trailing] widget is skipped, so its meaning goes here).
  final String? semanticDetail;

  /// Strike through and mute the title once checked: right for a task that
  /// is finished with, wrong for a habit that comes round again tomorrow.
  final bool strikeWhenChecked;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Semantics(
      checked: checked,
      label: [title, subtitle ?? semanticDetail].nonNulls.join(', '),
      excludeSemantics: true,
      onTap: onToggle,
      child: InkWell(
        onTap: onToggle,
        borderRadius: BorderRadius.circular(AppRadius.button),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppSpacing.xxl),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxs),
            child: LayoutBuilder(
              builder: (context, constraints) => Row(
                children: [
                  CheckCircle(checked: checked, color: color),
                  const SizedBox(width: AppSpacing.sm - AppSpacing.xxs),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: theme.textTheme.bodyLarge?.copyWith(
                            color: checked && strikeWhenChecked
                                ? theme.colorScheme.onSurfaceVariant
                                : null,
                            decoration: checked && strikeWhenChecked
                                ? TextDecoration.lineThrough
                                : null,
                          ),
                        ),
                        if (subtitle != null)
                          Text(subtitle!, style: theme.textTheme.bodySmall),
                      ],
                    ),
                  ),
                  // Given at most two fifths of the row, so that a large
                  // text size wraps it instead of pushing the title out.
                  if (trailing != null)
                    ConstrainedBox(
                      constraints: BoxConstraints(
                        maxWidth: constraints.maxWidth * 0.4,
                      ),
                      child: trailing,
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// What a section says when it has nothing in it: one plain sentence and,
/// where it makes sense, one way to add something. No blame, no nudging.
class SectionEmptyRow extends StatelessWidget {
  const SectionEmptyRow({
    super.key,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Wrap(
      alignment: WrapAlignment.spaceBetween,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        Padding(
          padding: const EdgeInsets.only(right: AppSpacing.xs),
          child: Text(
            message,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ),
        if (actionLabel != null)
          TextButton(onPressed: onAction, child: Text(actionLabel!)),
      ],
    );
  }
}
