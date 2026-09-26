import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/navigation/app_destination.dart';

import '../support/pump_app.dart';

void main() {
  testWidgets('a new user sees a plain welcome and a way into each area', (
    tester,
  ) async {
    await pumpApp(tester);

    expect(appBarTitle('Home'), findsOneWidget);
    expect(find.text('Welcome to Synos'), findsOneWidget);
    expect(find.textContaining('Choose an area'), findsOneWidget);
    for (final domain in AppDestination.domains) {
      expect(find.text(domain.summary!), findsOneWidget, reason: domain.label);
    }
  });

  testWidgets('does not scold, count or nag', (tester) async {
    await pumpApp(tester);

    for (final phrase in ['overdue', 'missed', 'behind', "don't forget", '!']) {
      expect(find.textContaining(phrase), findsNothing, reason: phrase);
    }
  });

  for (final domain in AppDestination.domains) {
    testWidgets('the ${domain.label} tile opens ${domain.label}', (
      tester,
    ) async {
      final router = await pumpApp(tester);

      await tapVisible(tester, find.text(domain.summary!));

      expect(locationOf(router), domain.path);
      expect(appBarTitle(domain.label), findsOneWidget);
    });
  }

  testWidgets('lays the areas out in two columns when there is room', (
    tester,
  ) async {
    await pumpApp(tester, size: tabletSize);

    final calendar = tester.getTopLeft(
      find.text(AppDestination.calendar.summary!),
    );
    final tasks = tester.getTopLeft(find.text(AppDestination.tasks.summary!));
    expect(tasks.dx, greaterThan(calendar.dx));
    expect(tasks.dy, calendar.dy);
  });

  testWidgets('stacks the areas in one column on a phone', (tester) async {
    await pumpApp(tester);

    final calendar = tester.getTopLeft(
      find.text(AppDestination.calendar.summary!),
    );
    final tasks = tester.getTopLeft(find.text(AppDestination.tasks.summary!));
    expect(tasks.dx, calendar.dx);
    expect(tasks.dy, greaterThan(calendar.dy));
  });

  testWidgets('scrolls on a short window rather than overflowing', (
    tester,
  ) async {
    await pumpApp(tester, size: const Size(390, 480));

    expect(tester.takeException(), isNull);
    await tester.scrollUntilVisible(
      find.text(AppDestination.meals.summary!),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(tester.takeException(), isNull);
  });
}
