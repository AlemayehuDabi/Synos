import 'package:flutter/material.dart';

import '../../../../core/navigation/app_destination.dart';
import '../../../../core/navigation/domain_placeholder_screen.dart';

// Placeholders until Calendar is built (Phase 3). The router only knows
// these three names, so the real screens replace them without touching it.

/// The calendar root: what the Calendar destination opens on.
class CalendarListScreen extends StatelessWidget {
  const CalendarListScreen({super.key});

  @override
  Widget build(BuildContext context) => const DomainPlaceholderScreen(
    destination: AppDestination.calendar,
    kind: PlaceholderKind.list,
  );
}

class CalendarDetailScreen extends StatelessWidget {
  const CalendarDetailScreen({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context) => DomainPlaceholderScreen(
    destination: AppDestination.calendar,
    kind: PlaceholderKind.detail,
    id: id,
  );
}

/// Add ([id] null) and edit share one form screen.
class CalendarFormScreen extends StatelessWidget {
  const CalendarFormScreen({super.key, this.id});

  final String? id;

  @override
  Widget build(BuildContext context) => DomainPlaceholderScreen(
    destination: AppDestination.calendar,
    kind: PlaceholderKind.form,
    id: id,
  );
}
