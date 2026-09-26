import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/auth/data/auth_providers.dart';
import 'package:mobile/features/auth/data/auth_service.dart';

import '../support/pump_app.dart';

class _RecordingAuthService extends MockAuthService {
  int logOuts = 0;

  @override
  Future<void> logOut() async => logOuts++;
}

void main() {
  testWidgets('Log out ends the session and returns to the log-in screen', (
    tester,
  ) async {
    final auth = _RecordingAuthService();
    final router = await pumpApp(
      tester,
      location: '/more',
      // The log-in screen it lands on overflows under the test font at phone
      // width (existing layout, exaggerated by the fallback font), so give
      // it a roomier window.
      size: tabletSize,
      overrides: [authServiceProvider.overrideWithValue(auth)],
    );

    await tester.tap(find.text('Log out'));
    await tester.pumpAndSettle();

    expect(auth.logOuts, 1);
    expect(locationOf(router), '/log-in');
  });
}
