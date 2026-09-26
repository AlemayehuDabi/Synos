import 'package:flutter/material.dart';

import '../router/route_paths.dart';
import '../theme/app_colors.dart';

/// Every top-level destination in the app shell. The declaration order is
/// the branch order of the shell route, so the enum's own `index` doubles as
/// the branch index - the router builds one branch per value, in this order.
///
/// The six domains carry the extras a placeholder or a list needs (accent
/// color, the name of the thing they hold, the build phase they land in).
/// [home] and [more] are plain destinations.
enum AppDestination {
  home(
    path: RoutePaths.home,
    label: 'Home',
    icon: Icons.home_outlined,
    selectedIcon: Icons.home_rounded,
  ),
  calendar(
    path: RoutePaths.calendar,
    label: 'Calendar',
    icon: Icons.calendar_month_outlined,
    selectedIcon: Icons.calendar_month_rounded,
    accent: AppColors.calendar,
    entity: 'event',
    summary: 'Events and schedules',
    phase: 3,
  ),
  tasks(
    path: RoutePaths.tasks,
    label: 'Tasks',
    icon: Icons.check_circle_outline_rounded,
    selectedIcon: Icons.check_circle_rounded,
    accent: AppColors.tasks,
    entity: 'task',
    summary: 'Things to do, and when',
    phase: 4,
  ),
  habits(
    path: RoutePaths.habits,
    label: 'Habits',
    icon: Icons.repeat_rounded,
    selectedIcon: Icons.repeat_on_rounded,
    accent: AppColors.habits,
    entity: 'habit',
    summary: 'Routines you keep',
    phase: 5,
  ),
  fitness(
    path: RoutePaths.fitness,
    label: 'Fitness',
    icon: Icons.fitness_center_outlined,
    selectedIcon: Icons.fitness_center_rounded,
    accent: AppColors.fitness,
    entity: 'workout',
    summary: 'Workouts and body metrics',
    phase: 6,
  ),
  finance(
    path: RoutePaths.finance,
    label: 'Finance',
    icon: Icons.account_balance_wallet_outlined,
    selectedIcon: Icons.account_balance_wallet_rounded,
    accent: AppColors.finance,
    entity: 'transaction',
    summary: 'Spending and budgets',
    phase: 7,
  ),
  meals(
    path: RoutePaths.meals,
    label: 'Meals',
    icon: Icons.restaurant_outlined,
    selectedIcon: Icons.restaurant_rounded,
    accent: AppColors.meals,
    entity: 'meal',
    summary: 'What you eat, and plan to',
    phase: 8,
  ),
  more(
    path: RoutePaths.more,
    label: 'More',
    icon: Icons.more_horiz_rounded,
    selectedIcon: Icons.more_horiz_rounded,
  );

  const AppDestination({
    required this.path,
    required this.label,
    required this.icon,
    required this.selectedIcon,
    this.accent,
    this.entity,
    this.summary,
    this.phase,
  });

  final String path;
  final String label;
  final IconData icon;
  final IconData selectedIcon;

  /// The domain's muted accent. Null for [home] and [more].
  final Color? accent;

  /// What the domain's list is made of, singular and lowercase ("event").
  final String? entity;

  /// One line saying what the domain is for.
  final String? summary;

  /// The build phase the domain's real screens land in. Only the placeholder
  /// screens read it, to say "Coming in Phase N"; once a domain ships it is
  /// unused and can go.
  final int? phase;

  bool get isDomain => accent != null;

  /// A domain reached through [more] on a compact window, where the bottom
  /// bar has no room for it.
  bool get isOverflow => overflow.contains(this);

  /// The destination shown as selected in the bottom bar when this one is
  /// showing: overflow domains highlight [more].
  AppDestination get barDestination => isOverflow ? more : this;

  /// "Event", "Task"... for screen titles. Only meaningful for domains.
  String get entityTitle {
    final name = entity ?? label.toLowerCase();
    return '${name[0].toUpperCase()}${name.substring(1)}';
  }

  // A domain's own screens. `new` is reserved: it can't be an id.
  String get newPath => '$path/new';
  String detailPath(String id) => '$path/${Uri.encodeComponent(id)}';
  String editPath(String id) => '${detailPath(id)}/edit';

  /// The destinations in the compact bottom bar. Six domains plus Home would
  /// be too many, so the least frequent ones live behind [more].
  static const List<AppDestination> bottomBar = [
    home,
    calendar,
    tasks,
    habits,
    more,
  ];

  /// The domains reached through [more] on a compact window.
  static const List<AppDestination> overflow = [fitness, finance, meals];

  /// Every domain, in navigation order.
  static List<AppDestination> get domains =>
      values.where((destination) => destination.isDomain).toList();
}
