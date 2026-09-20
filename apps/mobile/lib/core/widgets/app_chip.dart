import 'package:flutter/material.dart';

/// Lightweight status/filter chip. Pass [color] to tint it (e.g. success
/// green for "Completed", warning amber for "Due soon") — omit for a
/// neutral chip.
class AppChip extends StatelessWidget {
  const AppChip({
    super.key,
    required this.label,
    this.color,
    this.selected = false,
    this.onTap,
    this.icon,
  });

  final String label;
  final Color? color;
  final bool selected;
  final VoidCallback? onTap;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tint = color ?? theme.colorScheme.secondary;

    return GestureDetector(
      onTap: onTap,
      child: Chip(
        avatar: icon == null ? null : Icon(icon, size: 16, color: tint),
        label: Text(label),
        labelStyle: theme.textTheme.labelMedium?.copyWith(color: tint),
        backgroundColor: selected
            ? tint.withValues(alpha: 0.14)
            : theme.chipTheme.backgroundColor,
        side: BorderSide(color: selected ? tint : theme.dividerColor),
        visualDensity: VisualDensity.compact,
        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
      ),
    );
  }
}
