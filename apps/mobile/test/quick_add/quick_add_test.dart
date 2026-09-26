import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/navigation/app_destination.dart';
import 'package:mobile/features/home/application/today_controller.dart';
import 'package:mobile/features/home/data/mock_today_data.dart';
import 'package:mobile/features/home/data/models/today_models.dart';
import 'package:mobile/features/quick_add/data/models/quick_entry.dart';

import '../support/pump_app.dart';

final _fab = find.byTooltip('Quick add');

Future<void> _openQuickAdd(WidgetTester tester) async {
  await tester.tap(_fab);
  await tester.pumpAndSettle();
}

Future<void> _pick(WidgetTester tester, String noun) async {
  await tester.tap(find.text(noun));
  await tester.pumpAndSettle();
}

Future<void> _submit(WidgetTester tester, String label) async {
  await tester.tap(find.widgetWithText(FilledButton, label));
  await tester.pumpAndSettle();
}

Future<void> _type(WidgetTester tester, String text, {int field = 0}) async {
  await tester.enterText(find.byType(TextFormField).at(field), text);
  await tester.pump();
}

/// Today's data as it currently stands.
TodaySnapshot _day(WidgetTester tester) =>
    containerOf(tester).read(todayControllerProvider).value!;

/// Starts the load (nothing on screen reads it yet) and returns the day
/// before the test changes anything.
Future<TodaySnapshot> _load(WidgetTester tester) async {
  containerOf(tester).read(todayControllerProvider);
  await tester.pump(const Duration(milliseconds: 10));
  return _day(tester);
}

void main() {
  group('the button', () {
    testWidgets('floats over every top-level destination on a phone', (
      tester,
    ) async {
      await pumpApp(tester);

      for (final label in ['Home', 'Calendar', 'Tasks', 'Habits', 'More']) {
        await tapBar(tester, label);
        expect(_fab, findsOneWidget, reason: label);
      }
    });

    testWidgets('gets out of the way on a detail', (tester) async {
      await pumpApp(tester, location: '/calendar/abc');

      expect(_fab, findsNothing);
    });

    testWidgets('comes back when you return to the list', (tester) async {
      await pumpApp(tester, location: '/calendar/abc');

      await tester.tap(backButton);
      await tester.pumpAndSettle();

      expect(_fab, findsOneWidget);
    });

    testWidgets(
      'sits at the top of the rail on a wider window, on every screen',
      (tester) async {
        await pumpApp(tester, size: tabletSize, location: '/calendar/abc');

        expect(
          find.descendant(of: find.byType(NavigationRail), matching: _fab),
          findsOneWidget,
        );
      },
    );

    testWidgets('carries its label when the rail is extended', (tester) async {
      await pumpApp(tester, size: desktopSize);

      expect(
        find.descendant(
          of: find.byType(NavigationRail),
          matching: find.text('Quick add'),
        ),
        findsOneWidget,
      );
    });
  });

  group('the sheet', () {
    testWidgets('opens on a choice of the six areas', (tester) async {
      await pumpApp(tester);

      await _openQuickAdd(tester);

      expect(find.text('What would you like to add?'), findsOneWidget);
      for (final noun in [
        'Event',
        'Task',
        'Habit',
        'Workout',
        'Expense',
        'Meal',
      ]) {
        expect(find.text(noun), findsOneWidget, reason: noun);
      }
      for (final domain in AppDestination.domains) {
        expect(find.text(domain.label), findsWidgets, reason: domain.label);
      }
    });

    testWidgets('opens straight on the form for the area you are in', (
      tester,
    ) async {
      await pumpApp(tester, location: '/finance');

      await _openQuickAdd(tester);

      expect(find.text('New expense'), findsOneWidget);
      expect(find.text('Amount'), findsOneWidget);
    });

    testWidgets(
      'opens on the choice from Home and More, which are not an area',
      (tester) async {
        await pumpApp(tester);
        await _openQuickAdd(tester);
        expect(find.text('What would you like to add?'), findsOneWidget);

        await tester.tapAt(const Offset(195, 60)); // dismiss
        await tester.pumpAndSettle();
        await tapBar(tester, 'More');
        await _openQuickAdd(tester);
        expect(find.text('What would you like to add?'), findsOneWidget);
      },
    );

    testWidgets('lets you go back and choose a different area', (tester) async {
      await pumpApp(tester, location: '/calendar');
      await _openQuickAdd(tester);
      expect(find.text('New event'), findsOneWidget);

      await tester.tap(find.byTooltip('Choose a different area'));
      await tester.pumpAndSettle();
      expect(find.text('What would you like to add?'), findsOneWidget);

      await _pick(tester, 'Meal');
      expect(find.text('New meal'), findsOneWidget);
    });

    testWidgets('covers the whole app, bar included', (tester) async {
      await pumpApp(tester);
      await _openQuickAdd(tester);

      final sheet = tester.getRect(find.byType(BottomSheet));
      final bar = tester.getRect(find.byType(NavigationBar));
      expect(sheet.bottom, greaterThanOrEqualTo(bar.bottom));
      expect(sheet.top, lessThan(bar.top), reason: 'it rises over the bar');
    });

    testWidgets('adds nothing when dismissed', (tester) async {
      await pumpApp(tester, location: '/tasks');
      final before = (await _load(tester)).tasks.length;
      await _openQuickAdd(tester);
      await _type(tester, 'Something');

      await tester.tapAt(const Offset(195, 60)); // the scrim above the sheet
      await tester.pumpAndSettle();

      expect(find.text('Add task'), findsNothing);
      expect(_day(tester).tasks, hasLength(before));
      expect(find.byType(SnackBar), findsNothing);
    });

    testWidgets('fits a short window', (tester) async {
      await pumpApp(tester, size: const Size(390, 480), location: '/finance');

      await _openQuickAdd(tester);

      expect(tester.takeException(), isNull);
      expect(find.text('New expense'), findsOneWidget);
    });
  });

  group('the forms', () {
    testWidgets('a task needs a title', (tester) async {
      await pumpApp(tester, location: '/tasks');
      await _openQuickAdd(tester);

      await _submit(tester, 'Add task');

      expect(find.text('Enter a title'), findsOneWidget);
      expect(
        find.text('Add task'),
        findsWidgets,
        reason: 'the sheet stays open',
      );
    });

    testWidgets('a task lands in the priorities, high priority first', (
      tester,
    ) async {
      await pumpApp(tester, location: '/tasks');
      await _openQuickAdd(tester);
      await _type(tester, '  Call the bank  ');
      await tester.tap(find.text('High'));
      await tester.pump();

      await _submit(tester, 'Add task');

      expect(find.byType(BottomSheet), findsNothing);
      expect(find.text('Task added'), findsOneWidget);
      final tasks = _day(tester).tasks;
      expect(
        tasks[2].title,
        'Call the bank',
        reason: 'trimmed, after the other high ones',
      );
      expect(tasks[2].isHighPriority, isTrue);
    });

    testWidgets('a task for tomorrow is saved but not on today', (
      tester,
    ) async {
      await pumpApp(tester, location: '/tasks');
      await _openQuickAdd(tester);
      await _type(tester, 'Plan the trip');
      await tester.tap(find.text('Tomorrow'));
      await tester.pump();

      await _submit(tester, 'Add task');

      expect(find.text('Task added for tomorrow'), findsOneWidget);
      expect(
        _day(tester).tasks.map((t) => t.title),
        isNot(contains('Plan the trip')),
      );
    });

    testWidgets('an event needs a title, then joins the schedule', (
      tester,
    ) async {
      await pumpApp(tester, location: '/calendar');
      await _openQuickAdd(tester);
      await _submit(tester, 'Add event');
      expect(find.text('Enter a title'), findsOneWidget);

      await _type(tester, 'Coffee with Jo');
      await tester.tap(find.text('30 min'));
      await tester.pump();
      await _submit(tester, 'Add event');

      expect(find.text('Event added'), findsOneWidget);
      final added = _day(tester).schedule
          .firstWhere((i) => i.title == 'Coffee with Jo');
      expect(added.end.difference(added.start), const Duration(minutes: 30));
      expect(added.source, AppDestination.calendar);
    });

    testWidgets('an event for tomorrow says so, and leaves today alone', (
      tester,
    ) async {
      await pumpApp(tester, location: '/calendar');
      final before = (await _load(tester)).schedule.length;
      await _openQuickAdd(tester);
      await _type(tester, 'Early flight');
      await tester.tap(find.text('Tomorrow'));
      await tester.pump();

      await _submit(tester, 'Add event');

      expect(find.text('Event added for tomorrow'), findsOneWidget);
      expect(_day(tester).schedule, hasLength(before));
    });

    testWidgets('a habit needs a name, then joins the checklist unchecked', (
      tester,
    ) async {
      await pumpApp(tester, location: '/habits');
      await _openQuickAdd(tester);
      await _submit(tester, 'Add habit');
      expect(find.text('Enter a name'), findsOneWidget);

      await _type(tester, 'Stretch at lunch');
      await tester.tap(find.text('Weekdays'));
      await tester.pump();
      await _submit(tester, 'Add habit');

      expect(find.text('Habit added'), findsOneWidget);
      final habit = _day(tester).habits.last;
      expect(habit.title, 'Stretch at lunch');
      expect(habit.done, isFalse);
    });

    testWidgets('a workout needs nothing typed', (tester) async {
      await pumpApp(tester, location: '/fitness');
      await _openQuickAdd(tester);
      await tester.tap(find.text('Run'));
      await tester.pump();
      await tester.tap(find.text('45 min'));
      await tester.pump();

      await _submit(tester, 'Log workout');

      expect(find.text('Workout logged'), findsOneWidget);
      final logged = _day(tester).loggedWorkouts.single;
      expect(logged.kind, WorkoutKind.run);
      expect(logged.minutes, 45);
    });

    testWidgets('an expense needs an amount above zero', (tester) async {
      await pumpApp(tester, location: '/finance');
      await _openQuickAdd(tester);

      await _submit(tester, 'Log expense');
      expect(find.text('Enter an amount greater than 0'), findsOneWidget);

      await _type(tester, '0');
      await _submit(tester, 'Log expense');
      expect(find.text('Enter an amount greater than 0'), findsOneWidget);
      expect(find.byType(BottomSheet), findsOneWidget);
    });

    testWidgets('an expense counts against this week', (tester) async {
      await pumpApp(tester, location: '/finance');
      final before = (await _load(tester)).budget!.remaining;
      await _openQuickAdd(tester);
      await _type(tester, '1,250.50', field: 0);
      await tester.tap(find.text('Dining'));
      await tester.pump();
      await _type(tester, 'Team dinner', field: 1);

      await _submit(tester, 'Log expense');

      expect(find.text('Expense logged'), findsOneWidget);
      expect(_day(tester).budget!.remaining, closeTo(before - 1250.50, 0.001));
      expect(
        _day(tester).budget!.topCategories.first.category,
        ExpenseCategory.dining,
      );
    });

    testWidgets('an expense field takes only digits and separators', (
      tester,
    ) async {
      await pumpApp(tester, location: '/finance');
      await _openQuickAdd(tester);

      await _type(tester, 'a1b2.c5');

      expect(find.text('12.5'), findsOneWidget);
    });

    testWidgets('a meal needs a description, then joins the day', (
      tester,
    ) async {
      await pumpApp(tester, location: '/meals');
      await _openQuickAdd(tester);
      await _submit(tester, 'Add meal');
      expect(find.text('Describe the meal'), findsOneWidget);

      await _type(tester, 'Lentil soup');
      await tester.tap(find.text('Snack'));
      await tester.pump();
      await _submit(tester, 'Add meal');

      expect(find.text('Meal added'), findsOneWidget);
      final meal = _day(tester).meals
          .firstWhere((m) => m.name == 'Lentil soup');
      expect(meal.type, MealType.snack);
      expect(meal.logged, isFalse);
    });

    testWidgets('a form offers exactly its own choices', (tester) async {
      await pumpApp(tester, location: '/tasks');
      await _openQuickAdd(tester);

      for (final label in ['Today', 'Tomorrow', 'No date', 'Normal', 'High']) {
        expect(find.text(label), findsOneWidget, reason: label);
      }
      expect(find.text('Groceries'), findsNothing);
    });
  });

  group('scenarios', () {
    testWidgets(
      'an expense with no budget set is accepted and changes nothing',
      (tester) async {
        await pumpApp(
          tester,
          location: '/finance',
          scenario: TodayScenario.quietDay,
        );
        await _openQuickAdd(tester);
        await _type(tester, '20');

        await _submit(tester, 'Log expense');

        expect(find.text('Expense logged'), findsOneWidget);
        expect(_day(tester).budget, isNull);
      },
    );
  });
}
