import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/navigation/app_destination.dart';
import '../../home/application/today_controller.dart';
import 'quick_add_sheet.dart';

/// Opens quick add, and on submit adds what was entered to today's data and
/// confirms it in a snackbar. Shared by the floating button and by the empty
/// sections on Today, so they behave the same.
Future<void> openQuickAdd(
  BuildContext context,
  WidgetRef ref, {
  AppDestination? initialDomain,
}) async {
  // Taken before the sheet opens: the caller can be rebuilt somewhere else (a
  // resize moves the button from the bar to the rail) while the sheet is up,
  // and `ref` and `context` would be gone by the time it closes.
  final messenger = ScaffoldMessenger.of(context);
  final today = ref.read(todayControllerProvider.notifier);
  final entry = await showQuickAddSheet(context, initialDomain: initialDomain);
  if (entry == null) return;

  await today.add(entry);
  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(entry.confirmation)));
}
