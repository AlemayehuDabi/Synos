/// 8px base spacing scale. Prefer these tokens over raw numbers so spacing
/// stays consistent across the app.
abstract final class AppSpacing {
  static const double xxs = 4;
  static const double xs = 8;
  static const double sm = 16;
  static const double md = 24;
  static const double lg = 32;
  static const double xl = 40;
  static const double xxl = 48;
}

abstract final class AppRadius {
  static const double card = 12;
  static const double button = 10;
  static const double input = 10;
  static const double chip = 999; // pill
  static const double modal = 20;
}

abstract final class AppInsets {
  /// Bottom padding for scrolling content, so the floating quick-add button
  /// never covers its last row.
  static const double fabClearance = 88;
}
