import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/app_router.dart';
import 'package:mobile/core/router/route_paths.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/features/home/data/mock_today_data.dart';
import 'package:mobile/features/home/data/today_providers.dart';
import 'package:mobile/features/home/data/today_repository.dart';

/// The moment every test app believes it is: a Saturday morning, so the
/// budget week has two days left, with a workout and a dinner still ahead.
final testNow = DateTime(2026, 9, 26, 10, 15);

const phoneSize = Size(390, 844);
const tabletSize = Size(800, 1000);
const desktopSize = Size(1280, 800);
const phoneLandscapeSize = Size(900, 360);

/// Pumps the real app router (no splash, no auth) at [location] in a window
/// of [size], and returns the router so a test can read where it ended up.
///
/// Today's data comes from a made-up day in [scenario] that loads instantly;
/// pass a [todayRepository] of your own (or more [overrides]) to change that.
Future<GoRouter> pumpApp(
  WidgetTester tester, {
  String location = RoutePaths.home,
  Size size = phoneSize,
  ThemeMode themeMode = ThemeMode.light,
  TodayScenario scenario = TodayScenario.populated,
  TodayRepository? todayRepository,
  bool switchableScenarios = false,
  List<Override> overrides = const [],
  bool settle = true,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final router = createAppRouter(initialLocation: location);
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        if (switchableScenarios)
          // Follows the debug menu's choice, like the real provider does.
          todayRepositoryProvider.overrideWith(
            (ref) => MockTodayRepository(
              scenario: ref.watch(todayScenarioProvider),
              now: testNow,
              latency: Duration.zero,
            ),
          )
        else
          todayRepositoryProvider.overrideWithValue(
            todayRepository ??
                MockTodayRepository(
                  scenario: scenario,
                  now: testNow,
                  latency: Duration.zero,
                ),
          ),
        ...overrides,
      ],
      child: MaterialApp.router(
        theme: AppTheme.light,
        darkTheme: AppTheme.dark,
        themeMode: themeMode,
        routerConfig: router,
      ),
    ),
  );
  // A test that wants to look at the loading state passes `settle: false`.
  if (settle) {
    await tester.pumpAndSettle();
  } else {
    await tester.pump();
  }
  return router;
}

/// Where the router currently is, as a path.
String locationOf(GoRouter router) => router.state.uri.path;

/// The single visible app bar's title text.
Finder appBarTitle(String title) =>
    find.descendant(of: find.byType(AppBar), matching: find.text(title));

Finder inBottomBar(String label) =>
    find.descendant(of: find.byType(NavigationBar), matching: find.text(label));

Finder inRail(String label) => find.descendant(
  of: find.byType(NavigationRail),
  matching: find.text(label),
);

Future<void> tapBar(WidgetTester tester, String label) async {
  await tester.tap(inBottomBar(label));
  await tester.pumpAndSettle();
}

Future<void> tapRail(WidgetTester tester, String label) async {
  await tester.tap(inRail(label));
  await tester.pumpAndSettle();
}

Finder get backButton => find.byTooltip('Back');
Finder get closeButton => find.byTooltip('Close');

/// Presses the system back button (Android back, the iOS swipe). Returns
/// true when the app left the screen instead of handling it - i.e. the
/// platform was asked to exit.
Future<bool> pressSystemBack(WidgetTester tester) async {
  var exited = false;
  tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
    SystemChannels.platform,
    (call) async {
      if (call.method == 'SystemNavigator.pop') exited = true;
      return null;
    },
  );
  addTearDown(
    () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      null,
    ),
  );
  await tester.binding.handlePopRoute();
  await tester.pumpAndSettle();
  return exited;
}

/// Scrolls [finder] into view, lets the layout catch up, and taps it. (The
/// scroll only takes effect on the next frame, so tapping straight after
/// `ensureVisible` would aim at where the widget used to be.)
Future<void> tapVisible(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

/// The app's provider container, for reading state a test can't see on screen.
ProviderContainer containerOf(WidgetTester tester) =>
    ProviderScope.containerOf(tester.element(find.byType(MaterialApp)));
