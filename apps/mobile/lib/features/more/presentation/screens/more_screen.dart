import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/layout/breakpoints.dart';
import '../../../../core/navigation/app_destination.dart';
import '../../../../core/navigation/app_page.dart';
import '../../../../core/router/route_paths.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../auth/data/auth_providers.dart';

/// Everything that doesn't get a tab of its own. On a compact window that is
/// the less frequent domains (a wider window has them all in the rail) and
/// the account actions.
class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final showAreas = WindowSize.of(context).isCompact;

    return AppPage(
      title: 'More',
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.sm,
          AppSpacing.sm,
          AppSpacing.sm,
          AppInsets.fabClearance,
        ),
        children: [
          if (showAreas) ...[
            const _SectionLabel('Areas'),
            for (final domain in AppDestination.overflow) ...[
              NavTile.destination(domain, onTap: () => context.go(domain.path)),
              const SizedBox(height: AppSpacing.xs),
            ],
            const SizedBox(height: AppSpacing.xs),
          ],
          const _SectionLabel('Account'),
          const _LogOutTile(),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xs),
      child: Text(
        text,
        style: theme.textTheme.titleSmall?.copyWith(
          color: theme.colorScheme.onSurfaceVariant,
        ),
      ),
    );
  }
}

class _LogOutTile extends ConsumerStatefulWidget {
  const _LogOutTile();

  @override
  ConsumerState<_LogOutTile> createState() => _LogOutTileState();
}

class _LogOutTileState extends ConsumerState<_LogOutTile> {
  bool _loggingOut = false;

  Future<void> _logOut() async {
    setState(() => _loggingOut = true);
    await ref.read(authServiceProvider).logOut();
    if (!mounted) return;
    setState(() => _loggingOut = false);
    context.go(RoutePaths.logIn);
  }

  @override
  Widget build(BuildContext context) {
    return NavTile(
      icon: Icons.logout_rounded,
      title: 'Log out',
      onTap: _loggingOut ? null : _logOut,
      trailing: _loggingOut
          ? const SizedBox.square(
              dimension: 20,
              child: CircularProgressIndicator(strokeWidth: 2.4),
            )
          : const SizedBox.shrink(),
    );
  }
}
