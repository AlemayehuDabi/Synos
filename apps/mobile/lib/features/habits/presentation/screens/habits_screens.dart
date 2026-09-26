import 'package:flutter/material.dart';

import '../../../../core/navigation/app_destination.dart';
import '../../../../core/navigation/domain_placeholder_screen.dart';

// Placeholders until Habits is built (Phase 5). The router only knows
// these three names, so the real screens replace them without touching it.

/// The habits root: what the Habits destination opens on.
class HabitsListScreen extends StatelessWidget {
  const HabitsListScreen({super.key});

  @override
  Widget build(BuildContext context) => const DomainPlaceholderScreen(
    destination: AppDestination.habits,
    kind: PlaceholderKind.list,
  );
}

class HabitsDetailScreen extends StatelessWidget {
  const HabitsDetailScreen({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context) => DomainPlaceholderScreen(
    destination: AppDestination.habits,
    kind: PlaceholderKind.detail,
    id: id,
  );
}

/// Add ([id] null) and edit share one form screen.
class HabitsFormScreen extends StatelessWidget {
  const HabitsFormScreen({super.key, this.id});

  final String? id;

  @override
  Widget build(BuildContext context) => DomainPlaceholderScreen(
    destination: AppDestination.habits,
    kind: PlaceholderKind.form,
    id: id,
  );
}
