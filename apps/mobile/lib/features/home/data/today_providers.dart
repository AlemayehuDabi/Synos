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
