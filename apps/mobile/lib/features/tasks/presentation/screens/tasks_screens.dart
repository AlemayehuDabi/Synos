import 'package:flutter/material.dart';

import '../../../../core/navigation/app_destination.dart';
import '../../../../core/navigation/domain_placeholder_screen.dart';

// Placeholders until Tasks is built (Phase 4). The router only knows
// these three names, so the real screens replace them without touching it.

/// The tasks root: what the Tasks destination opens on.
class TasksListScreen extends StatelessWidget {
  const TasksListScreen({super.key});

  @override
  Widget build(BuildContext context) => const DomainPlaceholderScreen(
    destination: AppDestination.tasks,
    kind: PlaceholderKind.list,
  );
}

class TasksDetailScreen extends StatelessWidget {
  const TasksDetailScreen({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context) => DomainPlaceholderScreen(
    destination: AppDestination.tasks,
    kind: PlaceholderKind.detail,
    id: id,
  );
}

/// Add ([id] null) and edit share one form screen.
class TasksFormScreen extends StatelessWidget {
  const TasksFormScreen({super.key, this.id});

  final String? id;

  @override
  Widget build(BuildContext context) => DomainPlaceholderScreen(
    destination: AppDestination.tasks,
    kind: PlaceholderKind.form,
    id: id,
  );
}
