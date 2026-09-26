import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/navigation/app_destination.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/widgets/widgets.dart';

/// What Home shows before there is anything to show: a plain welcome and a
/// way into each area. There is no nudge and no count of what is missing -
/// it says where things are and leaves the choice to the user.
class HomeFirstRunState extends StatelessWidget {
  const HomeFirstRunState({super.key});

  static const _wideBreakpoint = 560.0;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return LayoutBuilder(
      builder: (context, constraints) {
        const padding = AppSpacing.sm;
        const gap = AppSpacing.xs;
        final columns = constraints.maxWidth >= _wideBreakpoint ? 2 : 1;
        final tileWidth =
            (constraints.maxWidth - padding * 2 - gap * (columns - 1)) /
            columns;

        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
            padding,
            padding,
            padding,
            AppInsets.fabClearance,
          ),
          children: [
            const EmptyState(
              icon: Icons.hub_outlined,
              title: 'Welcome to Synos',
              message:
                  'Your calendar, tasks, habits, fitness, finances and meals '
                  'come together here. Choose an area to start with.',
            ),
            const SizedBox(height: AppSpacing.md),
            Text(
              'Areas',
              style: theme.textTheme.titleSmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            Wrap(
              spacing: gap,
              runSpacing: gap,
              children: [
                for (final domain in AppDestination.domains)
                  SizedBox(
                    width: tileWidth,
                    child: NavTile.destination(
                      domain,
                      onTap: () => context.go(domain.path),
                    ),
                  ),
              ],
            ),
          ],
        );
      },
    );
  }
}
