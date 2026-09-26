import 'package:flutter/material.dart';

import '../../../../core/navigation/app_page.dart';
import '../../../../core/widgets/empty_state.dart';

/// Placeholder for the suggestion inbox, which lands in Phase 10. Today's
/// inbox card and badge already lead here.
class InboxScreen extends StatelessWidget {
  const InboxScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const AppPage(
      title: 'Inbox',
      body: EmptyState(
        icon: Icons.inbox_outlined,
        title: 'Coming in Phase 10',
        message: 'Suggestions from across your areas will be reviewed here.',
      ),
    );
  }
}
