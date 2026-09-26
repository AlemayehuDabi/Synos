import 'package:flutter/widgets.dart';

/// Width breakpoints, following the Material window size classes.
abstract final class AppBreakpoints {
  /// From here up the bottom bar gives way to a navigation rail.
  static const double medium = 600;

  /// From here up the rail is extended (icons with labels beside them).
  static const double expanded = 1024;

  /// Widest a page's content grows before it is centered instead.
  static const double contentMaxWidth = 840;
}

/// How much room the window has, and so which navigation pattern it gets:
/// a bottom bar on [compact], a rail on [medium], an extended rail on
/// [expanded].
enum WindowSize {
  compact,
  medium,
  expanded;

  static WindowSize fromWidth(double width) {
    if (width < AppBreakpoints.medium) return compact;
    if (width < AppBreakpoints.expanded) return medium;
    return expanded;
  }

  static WindowSize of(BuildContext context) =>
      fromWidth(MediaQuery.sizeOf(context).width);

  bool get isCompact => this == compact;
}
