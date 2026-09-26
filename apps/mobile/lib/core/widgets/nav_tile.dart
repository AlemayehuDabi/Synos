import 'package:flutter/material.dart';

import '../navigation/app_destination.dart';
import '../theme/app_spacing.dart';
import 'app_card.dart';

/// A tappable row: a tinted icon, a title, an optional line beneath it and a
/// trailing widget (a chevron by default). Used for jumping to a domain from
/// Home and More, and for actions in More.
class NavTile extends StatelessWidget {
  const NavTile({
    super.key,
    required this.icon,
    required this.title,
    required this.onTap,
    this.subtitle,
    this.accent,
    this.trailing,
  });

  /// A tile for [destination], tinted with its accent, saying what it is for.
  NavTile.destination(
    AppDestination destination, {
    super.key,
    required this.onTap,
  }) : icon = destination.icon,
       title = destination.label,
       subtitle = destination.summary,
       accent = destination.accent,
       trailing = null;

  final IconData icon;
  final String title;
  final String? subtitle;
  final Color? accent;
  final Widget? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tint = accent ?? theme.colorScheme.onSurfaceVariant;

    return Semantics(
      button: true,
      child: AppCard(
        onTap: onTap,
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.sm,
          vertical: AppSpacing.xs + AppSpacing.xxs,
        ),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppSpacing.xl),
          child: Row(
            children: [
              Container(
                width: AppSpacing.xl,
                height: AppSpacing.xl,
                decoration: BoxDecoration(
                  color: tint.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(AppRadius.button),
                ),
                child: Icon(icon, color: tint, size: 22),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(title, style: theme.textTheme.titleMedium),
                    if (subtitle != null)
                      Text(subtitle!, style: theme.textTheme.bodySmall),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.xs),
              trailing ??
                  Icon(
                    Icons.chevron_right_rounded,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
            ],
          ),
        ),
      ),
    );
  }
}
