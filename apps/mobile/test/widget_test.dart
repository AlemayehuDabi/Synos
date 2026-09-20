import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile/main.dart';

void main() {
  testWidgets('App boots to the splash screen', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: SynosApp()));

    expect(find.text('Synos'), findsOneWidget);

    // Let the splash screen's navigation timer fire so it doesn't leak
    // into the next test.
    await tester.pump(const Duration(milliseconds: 1500));
  });
}
