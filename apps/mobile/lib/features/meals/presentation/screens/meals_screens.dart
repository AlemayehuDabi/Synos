import 'package:flutter/material.dart';

import '../../../../core/navigation/app_destination.dart';
import '../../../../core/navigation/domain_placeholder_screen.dart';

// Placeholders until Meals is built (Phase 8). The router only knows
// these three names, so the real screens replace them without touching it.

/// The meals root: what the Meals destination opens on.
class MealsListScreen extends StatelessWidget {
  const MealsListScreen({super.key});

  @override
  Widget build(BuildContext context) => const DomainPlaceholderScreen(
    destination: AppDestination.meals,
    kind: PlaceholderKind.list,
  );
}

class MealsDetailScreen extends StatelessWidget {
  const MealsDetailScreen({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context) => DomainPlaceholderScreen(
    destination: AppDestination.meals,
    kind: PlaceholderKind.detail,
    id: id,
  );
}

/// Add ([id] null) and edit share one form screen.
class MealsFormScreen extends StatelessWidget {
  const MealsFormScreen({super.key, this.id});

  final String? id;

  @override
  Widget build(BuildContext context) => DomainPlaceholderScreen(
    destination: AppDestination.meals,
    kind: PlaceholderKind.form,
    id: id,
  );
}
