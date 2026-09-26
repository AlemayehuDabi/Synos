import 'package:flutter/material.dart';

import '../theme/app_spacing.dart';

/// Shows a themed modal bottom sheet with consistent padding and a safe
/// area for the keyboard/home indicator.
///
/// Pass [useRootNavigator] to cover the whole app shell (its bar or rail
/// too) instead of just the destination it was opened from.
Future<T?> showAppBottomSheet<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool isScrollControlled = true,
  bool useRootNavigator = false,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: isScrollControlled,
    useRootNavigator: useRootNavigator,
    useSafeArea: true,
    builder: (context) => Padding(
      padding: EdgeInsets.only(
        left: AppSpacing.sm,
        right: AppSpacing.sm,
        top: AppSpacing.sm,
        bottom: AppSpacing.sm + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: builder(context),
    ),
  );
}

/// Shows a themed, centered modal dialog (confirmations, small forms).
Future<T?> showAppDialog<T>({
  required BuildContext context,
  required String title,
  required Widget content,
  List<Widget>? actions,
}) {
  return showDialog<T>(
    context: context,
    builder: (context) =>
        AlertDialog(title: Text(title), content: content, actions: actions),
  );
}
