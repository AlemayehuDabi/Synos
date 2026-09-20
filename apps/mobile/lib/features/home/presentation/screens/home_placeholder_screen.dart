import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/route_paths.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/widgets/widgets.dart';
import '../../../auth/data/auth_providers.dart';

/// Stand-in landing screen for everything past Phase 1 (auth). Calendar,
/// tasks, habits, fitness, finance, and meals land here in later phases.
class HomePlaceholderScreen extends ConsumerStatefulWidget {
  const HomePlaceholderScreen({super.key});

  @override
  ConsumerState<HomePlaceholderScreen> createState() =>
      _HomePlaceholderScreenState();
}

class _HomePlaceholderScreenState extends ConsumerState<HomePlaceholderScreen> {
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
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Synos')),
      body: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const EmptyState(
              icon: Icons.hub_outlined,
              title: "You're all set",
              message:
                  'Calendar, tasks, habits, fitness, finance, and meals '
                  'arrive in the next build phases.',
            ),
            const SizedBox(height: AppSpacing.lg),
            SecondaryButton(
              label: 'Log out',
              isLoading: _loggingOut,
              onPressed: _logOut,
              fullWidth: false,
            ),
          ],
        ),
      ),
      backgroundColor: theme.scaffoldBackgroundColor,
    );
  }
}
