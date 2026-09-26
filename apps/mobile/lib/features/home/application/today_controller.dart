import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../quick_add/data/models/quick_entry.dart';
import '../data/models/today_models.dart';
import '../data/today_providers.dart';

final todayControllerProvider =
    AsyncNotifierProvider<TodayController, TodaySnapshot>(
      TodayController.new,
      // Riverpod retries a failing provider on its own, which would leave the
      // screen on its loading skeleton. A failed load should show the error
      // and let the user retry.
      retry: (retryCount, error) => null,
    );

/// The Today view's state: the loaded day, plus what the user does to it.
/// Loads through [todayRepositoryProvider], so changing the repository (or
/// the debug scenario behind it) reloads the day.
class TodayController extends AsyncNotifier<TodaySnapshot> {
  @override
  Future<TodaySnapshot> build() => ref.watch(todayRepositoryProvider).fetch();

  /// Pull-to-refresh, and the retry button. Riverpod keeps the day on the
  /// state while it reloads. If the reload fails and there was a day to show,
  /// that day stays (and the failure is recorded, for the screen to mention);
  /// if there was nothing to show, the state becomes the error.
  Future<void> refresh() async {
    final before = state;
    final hadDay = before.hasValue && !before.hasError;
    state = const AsyncLoading<TodaySnapshot>();
    try {
      state = AsyncData(await ref.read(todayRepositoryProvider).fetch());
    } catch (error, stackTrace) {
      if (hadDay) {
        state = before;
        ref.read(todayRefreshFailuresProvider.notifier).record();
      } else {
        state = AsyncError<TodaySnapshot>(error, stackTrace);
      }
    }
  }

  Future<void> toggleTask(String id) async {
    final task = state.value?.tasks.where((t) => t.id == id).firstOrNull;
    if (task == null) return;
    state = AsyncData(
      await ref.read(todayRepositoryProvider).setTaskDone(id, done: !task.done),
    );
  }

  Future<void> toggleHabit(String id) async {
    final habit = state.value?.habits.where((h) => h.id == id).firstOrNull;
    if (habit == null) return;
    state = AsyncData(
      await ref
          .read(todayRepositoryProvider)
          .setHabitDone(id, done: !habit.done),
    );
  }

  Future<void> add(QuickEntry entry) async {
    state = AsyncData(await ref.read(todayRepositoryProvider).add(entry));
  }
}
