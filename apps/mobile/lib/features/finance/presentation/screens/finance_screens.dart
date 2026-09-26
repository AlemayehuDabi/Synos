import 'package:flutter/material.dart';

import '../../../../core/navigation/app_destination.dart';
import '../../../../core/navigation/domain_placeholder_screen.dart';

// Placeholders until Finance is built (Phase 7). The router only knows
// these three names, so the real screens replace them without touching it.

/// The finance root: what the Finance destination opens on.
class FinanceListScreen extends StatelessWidget {
  const FinanceListScreen({super.key});

  @override
  Widget build(BuildContext context) => const DomainPlaceholderScreen(
    destination: AppDestination.finance,
    kind: PlaceholderKind.list,
  );
}

class FinanceDetailScreen extends StatelessWidget {
  const FinanceDetailScreen({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context) => DomainPlaceholderScreen(
    destination: AppDestination.finance,
    kind: PlaceholderKind.detail,
    id: id,
  );
}

/// Add ([id] null) and edit share one form screen.
class FinanceFormScreen extends StatelessWidget {
  const FinanceFormScreen({super.key, this.id});

  final String? id;

  @override
  Widget build(BuildContext context) => DomainPlaceholderScreen(
    destination: AppDestination.finance,
    kind: PlaceholderKind.form,
    id: id,
  );
}
