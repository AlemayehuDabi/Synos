import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'mock_today_data.dart';
import 'today_repository.dart';

/// Debug-only knob for reviewing every state of the Today view. Production
/// never changes it from [TodayScenario.populated].
final todayScenarioProvider =
    NotifierProvider<TodayScenarioNotifier, TodayScenario>(
      TodayScenarioNotifier.new,
    );

class TodayScenarioNotifier extends Notifier<TodayScenario> {
  @override
  TodayScenario build() => TodayScenario.populated;

  void select(TodayScenario scenario) => state = scenario;
}

/// Swap this single provider to point the Today view at the real API.
final todayRepositoryProvider = Provider<TodayRepository>(
  (ref) => MockTodayRepository(
    scenario: ref.watch(todayScenarioProvider),
    now: DateTime.now(),
  ),
);

/// How many pull-to-refreshes have failed. A failed refresh keeps the day on
/// screen (there is still a good day to show), so it is reported here, for
/// the screen to say so, rather than as an error state that would replace it.
final todayRefreshFailuresProvider =
    NotifierProvider<TodayRefreshFailures, int>(TodayRefreshFailures.new);

class TodayRefreshFailures extends Notifier<int> {
  @override
  int build() => 0;

  void record() => state++;
}
