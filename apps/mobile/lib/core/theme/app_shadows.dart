import 'package:flutter/material.dart';

import 'app_colors.dart';

/// Subtle elevation used for cards/surfaces. The design system calls for
/// soft shadows only — never heavy drop shadows.
abstract final class AppShadows {
  static const List<BoxShadow> card = [
    BoxShadow(color: AppColors.shadow, offset: Offset(0, 2), blurRadius: 8),
  ];

  static const List<BoxShadow> none = [];
}
