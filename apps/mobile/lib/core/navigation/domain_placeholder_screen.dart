import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../layout/breakpoints.dart';
import '../router/route_paths.dart';
import '../theme/app_spacing.dart';
import '../widgets/empty_state.dart';
import 'app_destination.dart';
import 'app_page.dart';

enum PlaceholderKind { list, detail, form }

/// Stand-in for a domain's real screens until its phase lands: the page
/// frame and navigation are final, the content just says when it is coming.
/// Each domain's own `*_screens.dart` wraps this, so replacing a domain's
/// screens later never touches the router.
class DomainPlaceholderScreen extends StatelessWidget {
  const DomainPlaceholderScreen({
    super.key,
    required this.destination,
    required this.kind,
    this.id,
  });

  final AppDestination destination;
  final PlaceholderKind kind;

  /// The item a detail or edit form is for; null for a list or a new item.
  final String? id;

  String get _entity => destination.entity ?? destination.label.toLowerCase();

  @override
  Widget build(BuildContext context) {
    return switch (kind) {
      PlaceholderKind.list => _buildList(context),
      PlaceholderKind.detail => AppPage(
        title: destination.entityTitle,
        actions: [
          IconButton(
            icon: const Icon(Icons.edit_outlined),
            tooltip: 'Edit $_entity',
            onPressed: id == null
                ? null
                : () => context.push(destination.editPath(id!)),
          ),
        ],
        body: _content(context, 'Details for this $_entity will appear here.'),
      ),
      PlaceholderKind.form => AppPage(
        title: id == null ? 'New $_entity' : 'Edit $_entity',
        isForm: true,
        body: _content(context, 'The $_entity form will appear here.'),
      ),
    };
  }

  Widget _buildList(BuildContext context) {
    // A domain that lives under More on a compact window has no tab of its
    // own, so its root page steps back up to More.
    final underMore =
        destination.isOverflow && WindowSize.of(context).isCompact;

    return AppPage(
      title: destination.label,
      parentPath: underMore ? RoutePaths.more : null,
      actions: [
        IconButton(
          icon: const Icon(Icons.add_rounded),
          tooltip: 'New $_entity',
          onPressed: () => context.push(destination.newPath),
        ),
      ],
      body: _content(
        context,
        destination.summary == null
            ? null
            : '${destination.summary} will appear here.',
        preview: kDebugMode,
      ),
    );
  }

  Widget _content(
    BuildContext context,
    String? message, {
    bool preview = false,
  }) {
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              EmptyState(
                icon: destination.icon,
                accentColor: destination.accent,
                title: 'Coming in Phase ${destination.phase}',
                message: message,
              ),
              if (kDebugMode && id != null)
                Text('ID $id', style: Theme.of(context).textTheme.bodySmall),
              if (preview) _DebugRoutePreview(destination: destination),
            ],
          ),
        ),
      ),
    );
  }
}

/// Debug builds only: the placeholder lists have nothing to tap through to a
/// detail or an edit form, so this opens them, to exercise the nested routes.
class _DebugRoutePreview extends StatelessWidget {
  const _DebugRoutePreview({required this.destination});

  final AppDestination destination;

  static const _sampleId = 'sample';

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.md),
      child: Column(
        children: [
          Text(
            'Debug: placeholder routes',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          Wrap(
            alignment: WrapAlignment.center,
            children: [
              TextButton(
                onPressed: () =>
                    context.push(destination.detailPath(_sampleId)),
                child: const Text('Open detail'),
              ),
              TextButton(
                onPressed: () => context.push(destination.editPath(_sampleId)),
                child: const Text('Open edit form'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
