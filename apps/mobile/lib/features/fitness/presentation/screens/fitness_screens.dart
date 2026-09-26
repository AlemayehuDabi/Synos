import 'package:flutter/material.dart';

import '../../../../core/navigation/app_destination.dart';
import '../../../../core/navigation/domain_placeholder_screen.dart';

// Placeholders until Fitness is built (Phase 6). The router only knows
// these three names, so the real screens replace them without touching it.

/// The fitness root: what the Fitness destination opens on.
class FitnessListScreen extends StatelessWidget {
  const FitnessListScreen({super.key});

  @override
  Widget build(BuildContext context) => const DomainPlaceholderScreen(
    destination: AppDestination.fitness,
    kind: PlaceholderKind.list,
  );
}

class FitnessDetailScreen extends StatelessWidget {
  const FitnessDetailScreen({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context) => DomainPlaceholderScreen(
    destination: AppDestination.fitness,
    kind: PlaceholderKind.detail,
    id: id,
  );
}

/// Add ([id] null) and edit share one form screen.
class FitnessFormScreen extends StatelessWidget {
  const FitnessFormScreen({super.key, this.id});

  final String? id;

  @override
  Widget build(BuildContext context) => DomainPlaceholderScreen(
    destination: AppDestination.fitness,
    kind: PlaceholderKind.form,
    id: id,
  );
}
