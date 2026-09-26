import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/navigation/app_destination.dart';

import '../support/pump_app.dart';

void main() {
  group('system back', () {
    testWidgets('leaves the app from Home', (tester) async {
      final router = await pumpApp(tester);

      final exited = await pressSystemBack(tester);

      expect(exited, isTrue);
      expect(locationOf(router), '/home');
    });

    testWidgets('goes from a tab root to Home, then leaves', (tester) async {
      final router = await pumpApp(tester, location: '/tasks');

      expect(await pressSystemBack(tester), isFalse);
      expect(locationOf(router), '/home');

      expect(await pressSystemBack(tester), isTrue);
    });

    testWidgets('goes from a domain under More to More, then Home', (
      tester,
    ) async {
      final router = await pumpApp(tester, location: '/meals');

      await pressSystemBack(tester);
      expect(locationOf(router), '/more');

      await pressSystemBack(tester);
      expect(locationOf(router), '/home');
    });

    testWidgets(
      'goes from that same domain straight to Home on a wide window',
      (tester) async {
        final router = await pumpApp(
          tester,
          location: '/meals',
          size: tabletSize,
        );

        await pressSystemBack(tester);

        expect(locationOf(router), '/home');
      },
    );

    testWidgets('pops a detail before anything else', (tester) async {
      final router = await pumpApp(tester, location: '/habits/abc');

      expect(await pressSystemBack(tester), isFalse);
      expect(locationOf(router), '/habits');

      await pressSystemBack(tester);
      expect(locationOf(router), '/home');
    });

    testWidgets('closes a form, then the detail beneath it', (tester) async {
      final router = await pumpApp(tester, location: '/calendar/abc/edit');

      await pressSystemBack(tester);
      expect(locationOf(router), '/calendar/abc');

      await pressSystemBack(tester);
      expect(locationOf(router), '/calendar');
    });

    testWidgets('behaves the same for every domain', (tester) async {
      for (final domain in AppDestination.domains) {
        final router = await pumpApp(
          tester,
          location: domain.detailPath('abc'),
        );

        await pressSystemBack(tester);
        expect(locationOf(router), domain.path, reason: domain.label);
      }
    });
  });
}
