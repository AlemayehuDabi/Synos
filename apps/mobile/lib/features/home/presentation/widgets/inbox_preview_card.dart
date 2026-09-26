import 'package:flutter/material.dart';

import '../../../../core/navigation/app_destination.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/utils/formatters.dart';
import '../../data/models/today_models.dart';
import 'today_card.dart';

/// How many cross-domain suggestions are waiting, and what the first is.
/// One tap opens the inbox (the full screen comes later). Tinted with the
/// brand teal rather than any one domain, because a suggestion belongs to
/// the connections between them.
class InboxPreviewCard extends StatelessWidget {
  const InboxPreviewCard({
    super.key,
    required this.suggestions,
    required this.onTap,
  });

  final List<Suggestion> suggestions;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tint = theme.colorScheme.secondary;
    final count = suggestions.length;
    final first = suggestions.first;
    final involved = <AppDestination>{
      for (final s in suggestions) ...[s.from, s.to],
    }.toList();
    final more = count > 1 ? ' and ${count - 1} more' : '';

    return Semantics(
      button: true,
      label:
          '${Formatters.plural(count, 'suggestion')} waiting. ${first.title}$more',
      excludeSemantics: true,
      child: Material(
        color: tint.withValues(alpha: 0.08),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.card),
          side: BorderSide(color: tint.withValues(alpha: 0.28)),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.sm),
            child: Row(
              children: [
                Container(
                  width: AppSpacing.xl,
                  height: AppSpacing.xl,
                  decoration: BoxDecoration(
                    color: tint.withValues(alpha: 0.16),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(Icons.inbox_outlined, color: tint, size: 22),
                ),
                const SizedBox(width: AppSpacing.sm - AppSpacing.xxs),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        Formatters.plural(count, 'suggestion'),
                        style: theme.textTheme.titleMedium,
                      ),
                      Text(
                        '${first.title}$more',
                        style: theme.textTheme.bodySmall,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: AppSpacing.xs),
                DomainDots(domains: involved),
                const SizedBox(width: AppSpacing.xxs),
                Icon(
                  Icons.chevron_right_rounded,
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
