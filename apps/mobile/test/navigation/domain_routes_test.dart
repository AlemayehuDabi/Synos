import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/navigation/app_destination.dart';

import '../support/pump_app.dart';

void main() {
  for (final domain in AppDestination.domains) {
    final entity = domain.entity!;
    final entityTitle = domain.entityTitle;

    group('${domain.label} routes', () {
      testWidgets(
        'the list has an add action that opens a form over the shell',
        (tester) async {
          final router = await pumpApp(
            tester,
            location: domain.path,
            size: tabletSize,
          );

          await tester.tap(find.byTooltip('New $entity'));
          await tester.pumpAndSettle();

          expect(locationOf(router), '/${domain.path.substring(1)}/new');
          expect(appBarTitle('New $entity'), findsOneWidget);
          expect(find.text('Coming in Phase ${domain.phase}'), findsOneWidget);
          expect(closeButton, findsOneWidget);
          expect(backButton, findsNothing);
          // The form covers the shell: no rail behind it.
          expect(find.byType(NavigationRail), findsNothing);
        },
      );

      testWidgets('closing the add form returns to the list', (tester) async {
        final router = await pumpApp(tester, location: domain.newPath);

        await tester.tap(closeButton);
        await tester.pumpAndSettle();

        expect(locationOf(router), domain.path);
        expect(appBarTitle(domain.label), findsOneWidget);
      });

      testWidgets('"new" is a form, never a detail with the id "new"', (
        tester,
      ) async {
        await pumpApp(tester, location: domain.newPath);

        expect(appBarTitle('New $entity'), findsOneWidget);
        expect(appBarTitle(entityTitle), findsNothing);
      });

      testWidgets('a detail opens inside the shell with a back arrow', (
        tester,
      ) async {
        final router = await pumpApp(tester, location: domain.path);

        await tester.tap(find.text('Open detail'));
        await tester.pumpAndSettle();

        expect(locationOf(router), domain.detailPath('sample'));
        expect(appBarTitle(entityTitle), findsOneWidget);
        expect(find.text('ID sample'), findsOneWidget);
        expect(backButton, findsOneWidget);
        expect(
          find.byType(NavigationBar),
          findsOneWidget,
          reason: 'the bar stays',
        );

        await tester.tap(backButton);
        await tester.pumpAndSettle();
        expect(locationOf(router), domain.path);
      });

      testWidgets('a deep link to a detail still has the list beneath it', (
        tester,
      ) async {
        // A wide window, where no root page has a back arrow of its own.
        final router = await pumpApp(
          tester,
          location: domain.detailPath('abc'),
          size: tabletSize,
        );

        expect(find.text('ID abc'), findsOneWidget);
        await tester.tap(backButton);
        await tester.pumpAndSettle();

        expect(locationOf(router), domain.path);
        expect(appBarTitle(domain.label), findsOneWidget);
        // Built while the detail sat on top of it, the list still knows it is a root.
        expect(backButton, findsNothing);
      });

      testWidgets('an id is decoded from the path, whatever it contains', (
        tester,
      ) async {
        final router = await pumpApp(
          tester,
          location: domain.detailPath('a b/c'),
        );

        expect(find.text('ID a b/c'), findsOneWidget);
        expect(locationOf(router), domain.detailPath('a b/c'));
      });

      testWidgets(
        'detail leads to an edit form, and closing it returns to the detail',
        (tester) async {
          final router = await pumpApp(
            tester,
            location: domain.detailPath('abc'),
          );

          await tester.tap(find.byTooltip('Edit $entity'));
          await tester.pumpAndSettle();

          expect(locationOf(router), domain.editPath('abc'));
          expect(appBarTitle('Edit $entity'), findsOneWidget);
          expect(find.text('ID abc'), findsOneWidget);
          expect(closeButton, findsOneWidget);

          await tester.tap(closeButton);
          await tester.pumpAndSettle();
          expect(locationOf(router), domain.detailPath('abc'));
          expect(appBarTitle(entityTitle), findsOneWidget);
        },
      );

      testWidgets(
        'a deep link to an edit form has the detail and list beneath it',
        (tester) async {
          final router = await pumpApp(
            tester,
            location: domain.editPath('abc'),
          );

          await tester.tap(closeButton);
          await tester.pumpAndSettle();
          expect(locationOf(router), domain.detailPath('abc'));

          await tester.tap(backButton);
          await tester.pumpAndSettle();
          expect(locationOf(router), domain.path);
        },
      );
    });
  }
}
