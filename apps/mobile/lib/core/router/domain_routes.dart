import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../navigation/app_destination.dart';

/// The routes every domain has, so all six navigate the same way:
///
/// * `/{domain}` - the list, the destination's root;
/// * `/{domain}/new` - add, a full-screen form over the shell;
/// * `/{domain}/:id` - detail, pushed inside the shell so the bar stays;
/// * `/{domain}/:id/edit` - edit, a full-screen form over the shell.
///
/// Because they are nested, a deep link to any of them still builds the
/// pages beneath it: back from `/calendar/abc` lands on `/calendar`.
/// `new` is declared before `:id`, so it is never read as an id.
List<RouteBase> domainRoutes({
  required AppDestination destination,
  required GlobalKey<NavigatorState> rootNavigatorKey,
  required Widget Function() list,
  required Widget Function(String id) detail,
  required Widget Function(String? id) form,
}) {
  return [
    GoRoute(
      path: destination.path,
      builder: (context, state) => list(),
      routes: [
        GoRoute(
          path: 'new',
          parentNavigatorKey: rootNavigatorKey,
          pageBuilder: (context, state) => _formPage(state, form(null)),
        ),
        GoRoute(
          path: ':id',
          builder: (context, state) => detail(state.pathParameters['id']!),
          routes: [
            GoRoute(
              path: 'edit',
              parentNavigatorKey: rootNavigatorKey,
              pageBuilder: (context, state) =>
                  _formPage(state, form(state.pathParameters['id'])),
            ),
          ],
        ),
      ],
    ),
  ];
}

// Forms slide up over the shell rather than across it: they are a task you
// finish or dismiss, not a place you navigated to.
Page<void> _formPage(GoRouterState state, Widget child) => MaterialPage<void>(
  key: state.pageKey,
  fullscreenDialog: true,
  child: child,
);
