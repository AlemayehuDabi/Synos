import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../layout/breakpoints.dart';
import '../theme/app_colors.dart';
import '../theme/app_spacing.dart';
import 'app_destination.dart';

/// The frame around every top-level destination: a bottom bar on a compact
/// window, a navigation rail on anything wider. [navigationShell] holds the
/// current destination's own navigator, so each destination keeps its own
/// back stack while you are away from it.
///
/// Back behaves the same way everywhere. The destination's own stack pops
/// first (a detail returns to its list). At a destination's root, back goes
/// up one level - to More for a domain that lives under it on a compact
/// window, otherwise to Home - and from Home it leaves the app.
class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  AppDestination get _current =>
      AppDestination.values[navigationShell.currentIndex];

  void _select(AppDestination destination) {
    navigationShell.goBranch(
      destination.index,
      // Tapping the destination you are already on returns to its root.
      initialLocation: destination.index == navigationShell.currentIndex,
    );
  }

  void _goUp(WindowSize size) {
    final target = _current.isOverflow && size.isCompact
        ? AppDestination.more
        : AppDestination.home;
    navigationShell.goBranch(target.index);
  }

  @override
  Widget build(BuildContext context) {
    final size = WindowSize.of(context);
    final current = _current;

    final scaffold = size.isCompact
        ? Scaffold(
            // The pages inside handle the keyboard themselves; the bar
            // should stay put underneath it, not ride up on top of it.
            resizeToAvoidBottomInset: false,
            body: navigationShell,
            bottomNavigationBar: _AppBottomBar(
              selected: current.barDestination,
              onSelected: _select,
            ),
          )
        : Scaffold(
            resizeToAvoidBottomInset: false,
            body: Row(
              children: [
                _AppRail(
                  selected: current,
                  extended: size == WindowSize.expanded,
                  onSelected: _select,
                ),
                Expanded(child: navigationShell),
              ],
            ),
          );

    return PopScope(
      // Only ever asked at a destination's root: anything nested in it was
      // popped first (see GoRouterDelegate.popRoute).
      canPop: current == AppDestination.home,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _goUp(size);
      },
      child: scaffold,
    );
  }
}

class _AppBottomBar extends StatelessWidget {
  const _AppBottomBar({required this.selected, required this.onSelected});

  final AppDestination selected;
  final ValueChanged<AppDestination> onSelected;

  @override
  Widget build(BuildContext context) {
    const destinations = AppDestination.bottomBar;

    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: Theme.of(context).dividerColor)),
      ),
      child: NavigationBar(
        selectedIndex: destinations.indexOf(selected),
        onDestinationSelected: (index) => onSelected(destinations[index]),
        destinations: [
          for (final destination in destinations)
            NavigationDestination(
              icon: Icon(destination.icon),
              selectedIcon: Icon(destination.selectedIcon),
              label: destination.label,
            ),
        ],
      ),
    );
  }
}

class _AppRail extends StatelessWidget {
  const _AppRail({
    required this.selected,
    required this.extended,
    required this.onSelected,
  });

  final AppDestination selected;
  final bool extended;
  final ValueChanged<AppDestination> onSelected;

  @override
  Widget build(BuildContext context) {
    const destinations = AppDestination.values;
    final theme = Theme.of(context);

    return SafeArea(
      right: false,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: theme.navigationRailTheme.backgroundColor,
          border: Border(right: BorderSide(color: theme.dividerColor)),
        ),
        // Eight destinations don't fit a short landscape window: scroll
        // rather than overflow (the pattern from the NavigationRail docs).
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: IntrinsicHeight(
                child: NavigationRail(
                  extended: extended,
                  labelType: extended
                      ? NavigationRailLabelType.none
                      : NavigationRailLabelType.all,
                  selectedIndex: selected.index,
                  onDestinationSelected: (index) =>
                      onSelected(destinations[index]),
                  leading: _BrandMark(showName: extended),
                  destinations: [
                    for (final destination in destinations)
                      NavigationRailDestination(
                        icon: Icon(destination.icon),
                        selectedIcon: Icon(destination.selectedIcon),
                        label: Text(destination.label),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _BrandMark extends StatelessWidget {
  const _BrandMark({required this.showName});

  final bool showName;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppColors.primary,
              borderRadius: BorderRadius.circular(AppRadius.button),
            ),
            child: const Icon(
              Icons.hub_outlined,
              color: AppColors.onPrimary,
              size: 22,
            ),
          ),
          if (showName) ...[
            const SizedBox(width: AppSpacing.xs),
            Text('Synos', style: Theme.of(context).textTheme.headlineSmall),
          ],
        ],
      ),
    );
  }
}
