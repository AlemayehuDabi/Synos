import 'package:flutter/material.dart';

import '../../../../core/theme/app_spacing.dart';
import '../../../../core/widgets/loading_skeleton.dart';

/// The shape of the Today view while it loads: a heading, the glance row and
/// a few cards, so the screen doesn't jump when the day arrives.
class TodaySkeleton extends StatelessWidget {
  const TodaySkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Loading today',
      child: ExcludeSemantics(
        child: ListView(
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.sm,
            AppSpacing.xs,
            AppSpacing.sm,
            AppSpacing.sm,
          ),
          children: const [
            LoadingSkeleton(height: 26, width: 220),
            SizedBox(height: AppSpacing.xxs),
            LoadingSkeleton(height: 14, width: 110),
            SizedBox(height: AppSpacing.sm),
            LoadingSkeleton(height: 88, borderRadius: 12),
            SizedBox(height: AppSpacing.sm),
            LoadingSkeleton(height: 196, borderRadius: 12),
            SizedBox(height: AppSpacing.sm),
            LoadingSkeleton(height: 196, borderRadius: 12),
          ],
        ),
      ),
    );
  }
}
