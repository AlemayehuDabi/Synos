import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Builds the Synos [TextTheme] on top of Inter, per the design system:
/// H1 28/600, H2 22/600, H3 18/500, Body 15/400, Caption/Label 13/500,
/// all at 1.4x line height.
abstract final class AppTypography {
  static TextTheme textTheme(Color textPrimary, Color textSecondary) {
    TextStyle style(double size, FontWeight weight, Color color) {
      return GoogleFonts.inter(
        fontSize: size,
        fontWeight: weight,
        height: 1.4,
        color: color,
      );
    }

    return TextTheme(
      displayLarge: style(28, FontWeight.w600, textPrimary),
      displayMedium: style(28, FontWeight.w600, textPrimary),
      displaySmall: style(22, FontWeight.w600, textPrimary),
      headlineLarge: style(28, FontWeight.w600, textPrimary), // H1
      headlineMedium: style(22, FontWeight.w600, textPrimary), // H2
      headlineSmall: style(18, FontWeight.w500, textPrimary), // H3
      titleLarge: style(18, FontWeight.w500, textPrimary), // H3
      titleMedium: style(15, FontWeight.w500, textPrimary),
      titleSmall: style(13, FontWeight.w500, textPrimary),
      bodyLarge: style(15, FontWeight.w400, textPrimary), // Body
      bodyMedium: style(15, FontWeight.w400, textPrimary), // Body
      bodySmall: style(13, FontWeight.w400, textSecondary), // Caption
      labelLarge: style(15, FontWeight.w500, textPrimary),
      labelMedium: style(13, FontWeight.w500, textPrimary), // Caption/Label
      labelSmall: style(12, FontWeight.w500, textSecondary),
    );
  }
}
