import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/navigation/app_destination.dart';

import '../support/pump_app.dart';

void main() {
  group('medium window', () {
    testWidgets('shows a rail with every destination and no bottom bar', (
      tester,
    ) async {
      await pumpApp(tester, size: tabletSize);

      expect(find.byType(NavigationRail), findsOneWidget);
      expect(find.byType(NavigationBar), findsNothing);
      for (final destination in AppDestination.values) {
        expect(
          inRail(destination.label),
          findsOneWidget,
          reason: destination.label,
        );
      }
      final rail = tester.widget<NavigationRail>(find.byType(NavigationRail));
      expect(rail.extended, isFalse);
    });

    testWidgets('reaches every domain directly from the rail', (tester) async {
      final router = await pumpApp(tester, size: tabletSize);

      for (final domain in AppDestination.domains) {
        await tapRail(tester, domain.label);

        expect(locationOf(router), domain.path, reason: domain.label);
        expect(appBarTitle(domain.label), findsOneWidget);
        expect(find.text('Coming in Phase ${domain.phase}'), findsOneWidget);
        final rail = tester.widget<NavigationRail>(find.byType(NavigationRail));
        expect(rail.selectedIndex, domain.index);
      }
    });

    testWidgets('a domain that sat under More has no back arrow here', (
      tester,
    ) async {
      await pumpApp(tester, size: tabletSize, location: '/fitness');

      expect(backButton, findsNothing);
    });

    testWidgets('More has no Areas section, since the rail lists them all', (
      tester,
    ) async {
      await pumpApp(tester, size: tabletSize);

      await tapRail(tester, 'More');

      expect(find.text('Account'), findsOneWidget);
      expect(find.text('Log out'), findsOneWidget);
      expect(find.text('Areas'), findsNothing);
    });

    testWidgets('each destination keeps its own place', (tester) async {
      final router = await pumpApp(
        tester,
        size: tabletSize,
        location: '/finance/abc',
      );

      await tapRail(tester, 'Meals');
      expect(locationOf(router), '/meals');

      await tapRail(tester, 'Finance');
      expect(locationOf(router), '/finance/abc');
    });
  });

  group('expanded window', () {
    testWidgets('extends the rail so labels sit beside the icons', (
      tester,
    ) async {
      await pumpApp(tester, size: desktopSize);

      final rail = tester.widget<NavigationRail>(find.byType(NavigationRail));
      expect(rail.extended, isTrue);
      expect(find.text('Synos'), findsOneWidget);
    });

    testWidgets('centers page content instead of stretching it', (
      tester,
    ) async {
      await pumpApp(tester, size: desktopSize, location: '/calendar');

      final width = tester.getSize(find.text('Coming in Phase 3')).width;
      expect(width, lessThan(840));
      final center = tester.getCenter(find.text('Coming in Phase 3')).dx;
      // Centered in the space beside the rail, not pinned to the left.
      expect(center, greaterThan(400));
    });
  });

  group('changing size', () {
    testWidgets('swaps bar for rail without losing the place', (tester) async {
      final router = await pumpApp(tester, location: '/tasks/abc');
      expect(find.byType(NavigationBar), findsOneWidget);

      tester.view.physicalSize = tabletSize;
      await tester.pumpAndSettle();

      expect(find.byType(NavigationRail), findsOneWidget);
      expect(find.byType(NavigationBar), findsNothing);
      expect(locationOf(router), '/tasks/abc');
      expect(find.text('ID abc'), findsOneWidget);
    });

    testWidgets(
      'a short landscape window scrolls the rail instead of overflowing',
      (tester) async {
        final router = await pumpApp(tester, size: phoneLandscapeSize);

        expect(tester.takeException(), isNull);
        await tapVisible(tester, inRail('More'));
        expect(locationOf(router), '/more');
        expect(tester.takeException(), isNull);
      },
    );
  });
}
