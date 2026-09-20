import 'package:flutter/material.dart';

/// Synos brand palette. Values are fixed by the design system — do not swap
/// in Material seed-generated colors here.
abstract final class AppColors {
  // Brand
  static const Color primary = Color(0xFF1E2A4A);
  static const Color primaryLight = Color(0xFF3A4A73);
  static const Color accent = Color(0xFF3B82C4);

  // Semantic
  static const Color success = Color(0xFF2E7D6B);
  static const Color warning = Color(0xFFB8862E);
  static const Color danger = Color(0xFFB84C3E);

  // Light surfaces
  static const Color lightBackground = Color(0xFFF7F7F5);
  static const Color lightSurface = Color(0xFFFFFFFF);
  static const Color lightTextPrimary = Color(0xFF1A1D24);
  static const Color lightTextSecondary = Color(0xFF6B7078);
  static const Color lightBorder = Color(0xFFE4E4E1);

  // Dark surfaces
  static const Color darkBackground = Color(0xFF14161C);
  static const Color darkSurface = Color(0xFF1D2028);
  static const Color darkTextPrimary = Color(0xFFEDEEF0);
  static const Color darkTextSecondary = Color(0xFF9AA0AA);
  static const Color darkBorder = Color(0xFF2A2D36);

  // Fixed across themes
  static const Color onPrimary = Color(0xFFFFFFFF);
  static const Color onDanger = Color(0xFFFFFFFF);
  static const Color onSuccess = Color(0xFFFFFFFF);

  static const Color shadow = Color(0x0F000000); // rgba(0,0,0,0.06) approx.
}
