import 'package:flutter/material.dart';

/// Synos palette. Calm and low-saturation: a deep muted teal for brand and
/// interaction, warm neutrals for surfaces, one muted accent per domain, and
/// red held back for genuine alerts. Values are fixed by the design system —
/// do not swap in Material seed-generated colors here.
abstract final class AppColors {
  // Brand
  static const Color primary = Color(0xFF1B4B4A);

  /// Interactive/lighter variant: links and focus in light mode, filled
  /// buttons in dark mode.
  static const Color primaryLight = Color(0xFF2A6F6D);

  /// [primaryLight] lifted so text and icons stay legible on dark surfaces
  /// (about 5.9:1 against [darkBackground]).
  static const Color primaryOnDark = Color(0xFF5B9E9B);

  // Domain accents. Muted on purpose: use them for icons, indicators and
  // tinted containers, not for body text.
  static const Color calendar = Color(0xFF4A6FA5);
  static const Color tasks = Color(0xFF5C6470);
  static const Color habits = Color(0xFF6B8F71);
  static const Color fitness = Color(0xFFC97064);
  static const Color finance = Color(0xFFC99A4A);
  static const Color meals = Color(0xFFB06A4F);

  // Semantic
  static const Color success = Color(0xFF2E7D6B);
  static const Color warning = Color(0xFFB8862E);

  /// Genuine alerts only (a budget overrun, a failed sync, a form that can't
  /// be submitted). Never for a missed habit or an overdue task.
  static const Color danger = Color(0xFFC0453D);

  // Light surfaces: warm off-white, never pure white.
  static const Color lightBackground = Color(0xFFFAF8F5);
  static const Color lightSurface = Color(0xFFFFFEFC);
  static const Color lightTextPrimary = Color(0xFF1A1D24);
  static const Color lightTextSecondary = Color(0xFF6B7078);
  static const Color lightBorder = Color(0xFFE7E3DC);

  // Dark surfaces: warm near-black, never pure black.
  static const Color darkBackground = Color(0xFF12151A);
  static const Color darkSurface = Color(0xFF1A1E25);
  static const Color darkTextPrimary = Color(0xFFECEAE6);
  static const Color darkTextSecondary = Color(0xFF9BA0A9);
  static const Color darkBorder = Color(0xFF2A2E37);

  // Fixed across themes
  static const Color onPrimary = Color(0xFFFFFFFF);
  static const Color onDanger = Color(0xFFFFFFFF);
  static const Color onSuccess = Color(0xFFFFFFFF);

  static const Color shadow = Color(0x0F000000); // rgba(0,0,0,0.06) approx.
}
