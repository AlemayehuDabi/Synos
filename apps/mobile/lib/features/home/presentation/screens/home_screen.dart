import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/navigation/app_page.dart';
import '../../../../core/router/route_paths.dart';
import '../../../../core/utils/formatters.dart';
import '../../../../core/widgets/empty_state.dart';
import '../../application/today_controller.dart';
import '../../data/mock_today_data.dart';
import '../../data/today_providers.dart';
import '../widgets/home_first_run_state.dart';
import '../widgets/today_dashboard.dart';
import '../widgets/today_skeleton.dart';

/// The Home destination: the Today view. Shows the day when there is one,
/// the first-run welcome when nothing is set up yet, a skeleton while it
/// loads and a retry when it can't. Pull down to refresh, whichever it is.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final today = ref.watch(todayControllerProvider);
    // A load that failed is an error even if an older day is still in memory.
    final snapshot = today.hasError ? null : today.value;

    // A refresh that fails keeps the day on screen and says so, rather than
    // replacing a good day with an error.
    ref.listen(todayRefreshFailuresProvider, (previous, next) {
      if (next > (previous ?? 0)) {
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(
            const SnackBar(
              content: Text("Couldn't refresh. Pull down to try again."),
            ),
          );
      }
    });

    Future<void> refresh() =>
        ref.read(todayControllerProvider.notifier).refresh();

    final Widget body;
    if (snapshot != null) {
      body = RefreshIndicator(
        onRefresh: refresh,
        child: snapshot.isEmpty
            ? const HomeFirstRunState()
            : TodayDashboard(
                snapshot: snapshot,
                onOpenInbox: () => context.go(RoutePaths.inbox),
              ),
      );
    } else if (today.hasError) {
      body = RefreshIndicator(
        onRefresh: refresh,
        child: LayoutBuilder(
          builder: (context, constraints) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            children: [
              SizedBox(
                height: constraints.maxHeight,
                child: EmptyState.networkError(onRetry: refresh),
              ),
            ],
          ),
        ),
      );
    } else {
      body = const TodaySkeleton();
    }

    return AppPage(
      title: 'Today',
      actions: [
        _InboxAction(count: snapshot?.suggestions.length ?? 0),
        if (kDebugMode) const _ScenarioMenu(),
      ],
      body: body,
    );
  }
}

class _InboxAction extends StatelessWidget {
  const _InboxAction({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: count == 0
          ? 'Inbox'
          : 'Inbox, ${Formatters.plural(count, 'suggestion')}',
      icon: Badge(
        isLabelVisible: count > 0,
        label: Text('$count'),
        child: const Icon(Icons.inbox_outlined),
      ),
      onPressed: () => context.go(RoutePaths.inbox),
    );
  }
}

/// Debug builds only: switch between the made-up days to review every state
/// of the screen without a backend.
class _ScenarioMenu extends ConsumerWidget {
  const _ScenarioMenu();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final current = ref.watch(todayScenarioProvider);

    return PopupMenuButton<TodayScenario>(
      tooltip: 'Preview data (debug only)',
      icon: const Icon(Icons.tune_rounded),
      initialValue: current,
      onSelected: ref.read(todayScenarioProvider.notifier).select,
      itemBuilder: (context) => [
        for (final scenario in TodayScenario.values)
          CheckedPopupMenuItem(
            value: scenario,
            checked: scenario == current,
            child: Text(scenario.label),
          ),
      ],
    );
  }
}
