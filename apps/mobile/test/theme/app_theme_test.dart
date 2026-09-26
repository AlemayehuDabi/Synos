import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_theme.dart';

/// WCAG contrast ratio between two opaque colors.
double contrast(Color a, Color b) {
  final la = a.computeLuminance();
  final lb = b.computeLuminance();
  final (light, dark) = la > lb ? (la, lb) : (lb, la);
  return (light + 0.05) / (dark + 0.05);
}

void main() {
  group('palette', () {
    test('uses the specified brand and background values', () {
      expect(AppColors.primary, const Color(0xFF1B4B4A));
      expect(AppColors.primaryLight, const Color(0xFF2A6F6D));
      expect(AppColors.lightBackground, const Color(0xFFFAF8F5));
      expect(AppColors.darkBackground, const Color(0xFF12151A));
      expect(AppColors.danger, const Color(0xFFC0453D));
    });

    test('uses the specified domain accents', () {
      expect(AppColors.calendar, const Color(0xFF4A6FA5));
      expect(AppColors.tasks, const Color(0xFF5C6470));
      expect(AppColors.habits, const Color(0xFF6B8F71));
      expect(AppColors.fitness, const Color(0xFFC97064));
      expect(AppColors.finance, const Color(0xFFC99A4A));
      expect(AppColors.meals, const Color(0xFFB06A4F));
    });

    test('never uses pure white or pure black for a surface', () {
      for (final color in [
        AppColors.lightBackground,
        AppColors.lightSurface,
        AppColors.darkBackground,
        AppColors.darkSurface,
      ]) {
        expect(color, isNot(const Color(0xFFFFFFFF)));
        expect(color, isNot(const Color(0xFF000000)));
      }
    });

    test('keeps red for alerts: no domain accent is red', () {
      for (final accent in [
        AppColors.calendar,
        AppColors.tasks,
        AppColors.habits,
        AppColors.fitness,
        AppColors.finance,
        AppColors.meals,
      ]) {
        expect(accent, isNot(AppColors.danger));
      }
      expect(AppTheme.light.colorScheme.error, AppColors.danger);
      expect(AppTheme.dark.colorScheme.error, AppColors.danger);
    });
  });

  group('themes', () {
    test('sit on the warm backgrounds', () {
      expect(AppTheme.light.scaffoldBackgroundColor, AppColors.lightBackground);
      expect(AppTheme.dark.scaffoldBackgroundColor, AppColors.darkBackground);
    });

    test('use the teal as the primary and interactive color', () {
      expect(AppTheme.light.colorScheme.primary, AppColors.primary);
      expect(AppTheme.light.colorScheme.secondary, AppColors.primaryLight);
      expect(AppTheme.dark.colorScheme.primary, AppColors.primaryLight);
      expect(AppTheme.dark.colorScheme.secondary, AppColors.primaryOnDark);
    });

    test('keep text and interactive colors readable (WCAG AA)', () {
      for (final (theme, background, surface) in [
        (AppTheme.light, AppColors.lightBackground, AppColors.lightSurface),
        (AppTheme.dark, AppColors.darkBackground, AppColors.darkSurface),
      ]) {
        final scheme = theme.colorScheme;
        expect(
          contrast(scheme.onSurface, background),
          greaterThanOrEqualTo(4.5),
        );
        expect(
          contrast(scheme.onSurfaceVariant, background),
          greaterThanOrEqualTo(4.5),
        );
        expect(
          contrast(scheme.secondary, background),
          greaterThanOrEqualTo(4.5),
        );
        expect(contrast(scheme.secondary, surface), greaterThanOrEqualTo(4.5));
        expect(
          contrast(scheme.onPrimary, scheme.primary),
          greaterThanOrEqualTo(4.5),
        );
      }
    });

    test('never rely on a domain accent alone to be readable', () {
      // The accents are muted on purpose, and the amber one is only about
      // 2.4:1 on the light background. That is fine while they only tint an
      // icon that sits beside a text label; it would not be for text.
      expect(
        contrast(AppColors.finance, AppColors.lightBackground),
        lessThan(3.0),
      );
      expect(
        contrast(
          AppTheme.light.colorScheme.onSurface,
          AppColors.lightBackground,
        ),
        greaterThan(4.5),
      );
    });

    test('define bar and rail themes', () {
      for (final theme in [AppTheme.light, AppTheme.dark]) {
        expect(theme.navigationBarTheme.height, 64);
        expect(
          theme.navigationBarTheme.labelBehavior,
          NavigationDestinationLabelBehavior.alwaysShow,
        );
        expect(theme.navigationRailTheme.minExtendedWidth, isNotNull);
      }
    });
  });
}
