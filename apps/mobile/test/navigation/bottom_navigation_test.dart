import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/navigation/app_destination.dart';

import '../support/pump_app.dart';

void main() {
  group('compact window', () {
    testWidgets('shows a five-item bottom bar and no rail', (tester) async {
      await pumpApp(tester);

      expect(find.byType(NavigationBar), findsOneWidget);
      expect(find.byType(NavigationRail), findsNothing);
      for (final label in ['Home', 'Calendar', 'Tasks', 'Habits', 'More']) {
        expect(inBottomBar(label), findsOneWidget, reason: label);
      }
    });

    testWidgets('keeps the three less frequent domains out of the bar', (
      tester,
    ) async {
      await pumpApp(tester);

      for (final label in ['Fitness', 'Finance', 'Meals']) {
        expect(inBottomBar(label), findsNothing, reason: label);
      }
    });

    testWidgets('opens on Home', (tester) async {
      final router = await pumpApp(tester);

      expect(locationOf(router), '/home');
      expect(appBarTitle('Home'), findsOneWidget);
      final bar = tester.widget<NavigationBar>(find.byType(NavigationBar));
      expect(bar.selectedIndex, 0);
    });

    for (final (destination, phase) in [
      (AppDestination.calendar, 3),
      (AppDestination.tasks, 4),
      (AppDestination.habits, 5),
    ]) {
      testWidgets(
        '${destination.label} is one tap away and says Phase $phase',
        (tester) async {
          final router = await pumpApp(tester);

          await tapBar(tester, destination.label);

          expect(locationOf(router), destination.path);
          expect(appBarTitle(destination.label), findsOneWidget);
          expect(find.text('Coming in Phase $phase'), findsOneWidget);
          final bar = tester.widget<NavigationBar>(find.byType(NavigationBar));
          expect(
            bar.selectedIndex,
            AppDestination.bottomBar.indexOf(destination),
          );
        },
      );
    }

    testWidgets('More lists the domains that have no tab, and the account', (
      tester,
    ) async {
      final router = await pumpApp(tester);

      await tapBar(tester, 'More');

      expect(locationOf(router), '/more');
      expect(appBarTitle('More'), findsOneWidget);
      for (final label in ['Fitness', 'Finance', 'Meals', 'Log out']) {
        expect(find.text(label), findsWidgets, reason: label);
      }
    });

    for (final (destination, phase) in [
      (AppDestination.fitness, 6),
      (AppDestination.finance, 7),
      (AppDestination.meals, 8),
    ]) {
      testWidgets(
        '${destination.label} opens from More, says Phase $phase and keeps More selected',
        (tester) async {
          final router = await pumpApp(tester);
          await tapBar(tester, 'More');

          await tester.tap(find.text(destination.label));
          await tester.pumpAndSettle();

          expect(locationOf(router), destination.path);
          expect(appBarTitle(destination.label), findsOneWidget);
          expect(find.text('Coming in Phase $phase'), findsOneWidget);
          final bar = tester.widget<NavigationBar>(find.byType(NavigationBar));
          expect(bar.selectedIndex, 4, reason: 'More stays highlighted');
        },
      );
    }

    testWidgets('a domain under More has a back arrow that returns to More', (
      tester,
    ) async {
      final router = await pumpApp(tester, location: '/fitness');

      expect(backButton, findsOneWidget);
      await tester.tap(backButton);
      await tester.pumpAndSettle();

      expect(locationOf(router), '/more');
      expect(appBarTitle('More'), findsOneWidget);
    });

    testWidgets('tab roots have no back arrow', (tester) async {
      await pumpApp(tester);

      for (final label in ['Home', 'Calendar', 'Tasks', 'Habits', 'More']) {
        await tapBar(tester, label);
        expect(backButton, findsNothing, reason: label);
      }
    });

    testWidgets('each tab keeps its own place while another is showing', (
      tester,
    ) async {
      final router = await pumpApp(tester, location: '/calendar/abc');
      expect(locationOf(router), '/calendar/abc');

      await tapBar(tester, 'Tasks');
      expect(locationOf(router), '/tasks');

      await tapBar(tester, 'Calendar');
      expect(locationOf(router), '/calendar/abc');
      expect(find.text('ID abc'), findsOneWidget);
    });

    testWidgets('tapping the tab you are on returns to its root', (
      tester,
    ) async {
      final router = await pumpApp(tester, location: '/calendar/abc');

      await tapBar(tester, 'Calendar');

      expect(locationOf(router), '/calendar');
      expect(find.text('Coming in Phase 3'), findsOneWidget);
    });

    testWidgets('survives large text without overflowing', (tester) async {
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(tester.platformDispatcher.clearAllTestValues);

      await pumpApp(tester);
      await tapBar(tester, 'More');

      expect(tester.takeException(), isNull);
    });

    testWidgets('renders in dark mode', (tester) async {
      await pumpApp(tester, themeMode: ThemeMode.dark);
      await tapBar(tester, 'Calendar');

      expect(tester.takeException(), isNull);
      expect(find.text('Coming in Phase 3'), findsOneWidget);
    });
  });
}
