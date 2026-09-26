import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/navigation/app_destination.dart';
import 'quick_add_actions.dart';

/// The universal "+": opens quick add from wherever the user is. Given the
/// domain they are looking at as [initialDomain], it opens on that form.
///
/// Whatever is entered goes to the Today view's data (see [openQuickAdd]),
/// so it shows up there straight away.
class QuickAddButton extends ConsumerWidget {
  const QuickAddButton({super.key, this.initialDomain, this.extended = false});

  final AppDestination? initialDomain;

  /// Show a text label beside the plus (for an expanded rail).
  final bool extended;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // No hero: the shell's button would otherwise fly between routes.
    if (extended) {
      return FloatingActionButton.extended(
        heroTag: null,
        onPressed: () =>
            openQuickAdd(context, ref, initialDomain: initialDomain),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Quick add'),
      );
    }
    return FloatingActionButton(
      heroTag: null,
      tooltip: 'Quick add',
      onPressed: () => openQuickAdd(context, ref, initialDomain: initialDomain),
      child: const Icon(Icons.add_rounded),
    );
  }
}
