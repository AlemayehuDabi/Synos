import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/navigation/app_destination.dart';
import '../../home/application/today_controller.dart';
import 'quick_add_sheet.dart';

/// The universal "+": opens quick add from wherever the user is. Given the
/// domain they are looking at as [initialDomain], it opens on that form.
///
/// Whatever is entered goes to the Today view's data, so it shows up there
/// straight away.
class QuickAddButton extends ConsumerWidget {
  const QuickAddButton({super.key, this.initialDomain, this.extended = false});

  final AppDestination? initialDomain;

  /// Show a text label beside the plus (for an expanded rail).
  final bool extended;

  Future<void> _open(BuildContext context, WidgetRef ref) async {
    // Taken before the sheet opens: the button can be rebuilt somewhere else
    // (a resize moves it from the bar to the rail) while the sheet is up,
    // and `ref` and `context` would be gone by the time it closes.
    final messenger = ScaffoldMessenger.of(context);
    final today = ref.read(todayControllerProvider.notifier);
    final entry = await showQuickAddSheet(
      context,
      initialDomain: initialDomain,
    );
    if (entry == null) return;

    await today.add(entry);
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(entry.confirmation)));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // No hero: the shell's button would otherwise fly between routes.
    if (extended) {
      return FloatingActionButton.extended(
        heroTag: null,
        onPressed: () => _open(context, ref),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Quick add'),
      );
    }
    return FloatingActionButton(
      heroTag: null,
      tooltip: 'Quick add',
      onPressed: () => _open(context, ref),
      child: const Icon(Icons.add_rounded),
    );
  }
}
