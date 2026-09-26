import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/navigation/app_destination.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_spacing.dart';
import 'package:mobile/features/home/data/mock_today_data.dart';
import 'package:mobile/features/home/data/models/today_models.dart';
import 'package:mobile/features/home/data/today_repository.dart';
import 'package:mobile/features/home/presentation/widgets/today_card.dart';
import 'package:mobile/features/home/presentation/widgets/today_skeleton.dart';
import 'package:mobile/features/quick_add/presentation/quick_add_sheet.dart';

import '../support/pump_app.dart';

/// Counts loads, and can be made to fail from a given load onward.
class _CountingRepository extends MockTodayRepository {
  _CountingRepository({
    super.scenario = TodayScenario.populated,
    DateTime? now,
    this.failFrom,
    super.latency = Duration.zero,
  }) : super(now: now ?? testNow);

  final int? failFrom;
  int fetches = 0;

  @override
  Future<TodaySnapshot> fetch() async {
    fetches++;
    if (failFrom != null && fetches >= failFrom!) {
      throw const TodayLoadException();
    }
    return super.fetch();
  }
}

Finder _card(String name) => find.byKey(Key('card-$name'));
Finder _glance() => find.byKey(const Key('day-glance'));
Finder _inCard(String name, String text) =>
    find.descendant(of: _card(name), matching: find.text(text));
Finder _inGlance(String text) =>
    find.descendant(of: _glance(), matching: find.text(text));

bool _isAlert(Color? color) =>
    color == AppColors.danger || color == AppColors.dangerOnDark;

/// Every place on screen that is drawn in the alert red.
List<String> _alertUses(WidgetTester tester) {
  final uses = <String>[];
  for (final e in find.byType(Text).evaluate()) {
    final text = e.widget as Text;
    if (_isAlert(text.style?.color)) uses.add('text "${text.data}"');
  }
  for (final e in find.byType(Icon).evaluate()) {
    final icon = e.widget as Icon;
    if (_isAlert(icon.color)) uses.add('icon ${icon.icon}');
  }
  for (final e in find.byType(LinearProgressIndicator).evaluate()) {
    if (_isAlert((e.widget as LinearProgressIndicator).color)) {
      uses.add('progress bar');
    }
  }
  return uses;
}

/// Scrolls Today back to the top; the rows above the fold are not kept
/// built once they are far off screen.
Future<void> _toTop(WidgetTester tester) async {
  await tester.drag(find.byType(ListView).first, const Offset(0, 5000));
  await tester.pumpAndSettle();
}

Future<void> _drag(WidgetTester tester) async {
  await tester.drag(find.byType(ListView).first, const Offset(0, 400));
  await tester.pump();
  await tester.pump(const Duration(seconds: 1));
  await tester.pumpAndSettle();
}

void main() {
  group('a busy day', () {
    testWidgets('leads with the date and when it was last updated', (
      tester,
    ) async {
      await pumpApp(tester);

      expect(appBarTitle('Today'), findsOneWidget);
      expect(find.text('Saturday, 26 September'), findsOneWidget);
      expect(find.text('Updated 10:15 AM'), findsOneWidget);
      expect(find.text('Welcome to Synos'), findsNothing);
    });

    testWidgets(
      'has a card for each of the six domains, in one consistent frame',
      (tester) async {
        await pumpApp(tester);

        const titles = {
          'schedule': ('Schedule', AppDestination.calendar),
          'priorities': ('Priorities', AppDestination.tasks),
          'habits': ('Habits', AppDestination.habits),
          'meals': ('Meals', AppDestination.meals),
          'budget': ("This week's budget", AppDestination.finance),
          'workout': ('Next workout', AppDestination.fitness),
        };
        for (final entry in titles.entries) {
          final (title, domain) = entry.value;
          expect(_inCard(entry.key, title), findsOneWidget, reason: entry.key);
          final chip = tester.widget<DomainChip>(
            find
                .descendant(
                  of: _card(entry.key),
                  matching: find.byType(DomainChip),
                )
                .first,
          );
          expect(
            chip.domain,
            domain,
            reason: '${entry.key} wears its own accent',
          );
        }
        expect(find.byType(TodayCard), findsNWidgets(6));
      },
    );

    testWidgets(
      'shows the whole day in one row, each stat a way into its area',
      (tester) async {
        final router = await pumpApp(tester);

        for (final (value, label) in [
          ('3', 'Events'),
          ('5', 'Tasks'),
          ('2/6', 'Habits'),
          ('1/4', 'Meals'),
          ('\$212', 'Left'),
          ('6:00 PM', 'Workout'),
        ]) {
          expect(_inGlance(value), findsOneWidget, reason: value);
          expect(_inGlance(label), findsOneWidget, reason: label);
        }

        await tester.tap(_inGlance('Tasks'));
        await tester.pumpAndSettle();
        expect(locationOf(router), '/tasks');
      },
    );

    testWidgets('links the tiles to their own areas', (tester) async {
      for (final (label, path) in [
        ('Events', '/calendar'),
        ('Habits', '/habits'),
        ('Meals', '/meals'),
        ('Left', '/finance'),
        ('Workout', '/fitness'),
      ]) {
        final router = await pumpApp(tester);
        await tester.tap(_inGlance(label));
        await tester.pumpAndSettle();
        expect(locationOf(router), path, reason: label);
      }
    });

    testWidgets('a header opens its own area', (tester) async {
      final router = await pumpApp(tester);

      await tapVisible(tester, _inCard('habits', 'Habits'));

      expect(locationOf(router), '/habits');
    });

    testWidgets('shows only accent, never alarm: no red anywhere', (
      tester,
    ) async {
      await pumpApp(tester);

      expect(_alertUses(tester), isEmpty);
    });

    testWidgets('says where two domains meet, at the foot of the card', (
      tester,
    ) async {
      await pumpApp(tester);

      expect(find.byType(ConnectionNoteRow), findsNWidgets(3));
      expect(
        _inCard(
          'schedule',
          'Focus time is blocked from your task “Finalize Q4 planning outline”.',
        ),
        findsOneWidget,
      );
      expect(
        _inCard(
          'budget',
          'Your meal plan needs about \$46 more in groceries this week.',
        ),
        findsOneWidget,
      );
      expect(
        _inCard(
          'workout',
          'Held on your calendar so nothing else lands on it.',
        ),
        findsOneWidget,
      );
    });
  });

  group('the schedule', () {
    testWidgets(
      'lists calendar events and the blocks other domains put on it',
      (tester) async {
        await pumpApp(tester);

        for (final title in [
          'Team standup',
          'Focus: Q4 planning outline',
          'Lunch with Maya',
          'Design review',
          'Upper body strength',
        ]) {
          expect(_inCard('schedule', title), findsOneWidget, reason: title);
        }
        expect(_inCard('schedule', 'Video call'), findsOneWidget);
        expect(_inCard('schedule', 'Café Lume'), findsOneWidget);
        expect(_inCard('schedule', 'From Tasks'), findsOneWidget);
        expect(_inCard('schedule', 'From Fitness'), findsOneWidget);
        expect(_inCard('schedule', '9:00 AM'), findsOneWidget);
        expect(_inCard('schedule', '6 today'), findsOneWidget);
      },
    );

    testWidgets('shows five and points to the rest', (tester) async {
      final router = await pumpApp(tester);

      expect(_inCard('schedule', 'Dinner'), findsNothing);
      await tapVisible(tester, find.text('View all 6 in Calendar'));

      expect(locationOf(router), '/calendar');
    });

    testWidgets('marks what is on now', (tester) async {
      await pumpApp(tester); // 10:15: the focus block runs 10:00 to 12:00

      expect(_inCard('schedule', 'Now'), findsOneWidget);
      expect(_inCard('schedule', 'Next'), findsNothing);
      final now = tester.getCenter(_inCard('schedule', 'Now')).dy;
      final row = tester
          .getCenter(_inCard('schedule', 'Focus: Q4 planning outline'))
          .dy;
      expect((now - row).abs(), lessThan(30));
    });

    testWidgets('marks what is next when nothing is on', (tester) async {
      await pumpApp(
        tester,
        todayRepository: _CountingRepository(now: DateTime(2026, 9, 26, 8)),
      );

      expect(_inCard('schedule', 'Now'), findsNothing);
      expect(_inCard('schedule', 'Next'), findsOneWidget);
      final next = tester.getCenter(_inCard('schedule', 'Next')).dy;
      final row = tester.getCenter(_inCard('schedule', 'Team standup')).dy;
      expect((next - row).abs(), lessThan(30));
    });

    testWidgets('marks nothing once the day is over', (tester) async {
      await pumpApp(
        tester,
        todayRepository: _CountingRepository(now: DateTime(2026, 9, 26, 22)),
      );

      expect(_inCard('schedule', 'Now'), findsNothing);
      expect(_inCard('schedule', 'Next'), findsNothing);
    });
  });

  group('priorities', () {
    testWidgets('lists the top tasks with what matters about each', (
      tester,
    ) async {
      await pumpApp(tester);

      expect(_inCard('priorities', '5 open'), findsOneWidget);
      expect(
        _inCard('priorities', 'Finalize Q4 planning outline'),
        findsOneWidget,
      );
      expect(
        _inCard('priorities', 'High priority · Due 12:00 · about 2 hours'),
        findsOneWidget,
      );
      expect(
        _inCard('priorities', 'High priority · Due today'),
        findsOneWidget,
      );
      expect(
        _inCard('priorities', 'Due yesterday'),
        findsOneWidget,
        reason: 'an earlier date, said plainly',
      );
      expect(_inCard('priorities', 'About 30 minutes'), findsOneWidget);
    });

    testWidgets('a task checks off and back on', (tester) async {
      await pumpApp(tester);

      await tapVisible(
        tester,
        _inCard('priorities', 'Send invoice to Northwind'),
      );

      expect(_inCard('priorities', '4 open'), findsOneWidget);
      var title = tester.widget<Text>(
        _inCard('priorities', 'Send invoice to Northwind'),
      );
      expect(title.style?.decoration, TextDecoration.lineThrough);
      await _toTop(tester);
      expect(_inGlance('4'), findsOneWidget, reason: 'the glance row follows');

      await tapVisible(
        tester,
        _inCard('priorities', 'Send invoice to Northwind'),
      );

      expect(_inCard('priorities', '5 open'), findsOneWidget);
      title = tester.widget<Text>(
        _inCard('priorities', 'Send invoice to Northwind'),
      );
      expect(title.style?.decoration, isNot(TextDecoration.lineThrough));
    });

    testWidgets('says "All done" when everything is', (tester) async {
      await pumpApp(tester, scenario: TodayScenario.quietDay);

      await tapVisible(tester, _inCard('priorities', 'Repot the fern'));
      await tapVisible(tester, _inCard('priorities', 'Reply to the landlord'));

      expect(_inCard('priorities', 'All done'), findsOneWidget);
    });
  });

  group('habits', () {
    testWidgets('is a checklist with a plain streak beside each habit', (
      tester,
    ) async {
      await pumpApp(tester);

      expect(_inCard('habits', '2 of 6'), findsOneWidget);
      expect(_inCard('habits', 'Morning stretch'), findsOneWidget);
      expect(_inCard('habits', '12-day streak'), findsOneWidget);
      expect(_inCard('habits', 'No screens after 22:00'), findsOneWidget);
      final bar = tester.widget<LinearProgressIndicator>(
        find.descendant(
          of: _card('habits'),
          matching: find.byType(LinearProgressIndicator),
        ),
      );
      expect(bar.value, closeTo(2 / 6, 0.001));
      expect(bar.color, AppDestination.habits.accent);
    });

    testWidgets('a habit checks off, moving the count and the bar', (
      tester,
    ) async {
      await pumpApp(tester);

      await tapVisible(tester, _inCard('habits', 'Read 20 pages'));

      expect(_inCard('habits', '3 of 6'), findsOneWidget);
      final bar = tester.widget<LinearProgressIndicator>(
        find.descendant(
          of: _card('habits'),
          matching: find.byType(LinearProgressIndicator),
        ),
      );
      expect(bar.value, closeTo(0.5, 0.001));
      await _toTop(tester);
      expect(
        _inGlance('3/6'),
        findsOneWidget,
        reason: 'the glance row follows',
      );
    });

    testWidgets(
      'a done habit is not struck through: it comes round again tomorrow',
      (tester) async {
        await pumpApp(tester);

        final done = tester.widget<Text>(_inCard('habits', 'Morning stretch'));
        expect(done.style?.decoration, isNot(TextDecoration.lineThrough));
      },
    );
  });

  group('meals, budget and workout', () {
    testWidgets('meals show the plan with what is logged marked', (
      tester,
    ) async {
      await pumpApp(tester);

      expect(_inCard('meals', '1 of 4 logged'), findsOneWidget);
      expect(
        _inCard('meals', 'Breakfast · 8:00 AM · 420 kcal'),
        findsOneWidget,
      );
      expect(_inCard('meals', 'Dinner · 7:30 PM · 720 kcal'), findsOneWidget);
      expect(
        find.descendant(
          of: _card('meals'),
          matching: find.byIcon(Icons.check_circle_rounded),
        ),
        findsOneWidget,
        reason: 'only the breakfast is logged',
      );
    });

    testWidgets('the budget shows what is left, and how the week is going', (
      tester,
    ) async {
      await pumpApp(tester);

      expect(_inCard('budget', '\$212'), findsOneWidget);
      expect(_inCard('budget', 'left'), findsOneWidget);
      expect(_inCard('budget', 'of \$400'), findsOneWidget);
      expect(_inCard('budget', '2 days left'), findsOneWidget);
      expect(
        _inCard('budget', 'Spent \$188 · Groceries \$92 · Dining \$61'),
        findsOneWidget,
      );
      final bar = tester.widget<LinearProgressIndicator>(
        find.descendant(
          of: _card('budget'),
          matching: find.byType(LinearProgressIndicator),
        ),
      );
      expect(bar.value, closeTo(188.40 / 400, 0.001));
      expect(bar.color, AppDestination.finance.accent);
    });

    testWidgets('the workout shows the next session and opens it', (
      tester,
    ) async {
      final router = await pumpApp(tester);

      expect(_inCard('workout', 'Upper body strength'), findsOneWidget);
      expect(_inCard('workout', '6:00 PM · 55 min'), findsOneWidget);
      expect(
        _inCard('workout', '12-week strength · Day 3 of 4'),
        findsOneWidget,
      );
      expect(
        _inCard('workout', 'Bench press, rows, overhead press and 2 more'),
        findsOneWidget,
      );

      await tapVisible(tester, _inCard('workout', 'Upper body strength'));

      expect(locationOf(router), '/fitness/w-upper');
      // Back goes up one level, to Fitness, which then has its own way back.
      await tester.tap(backButton);
      await tester.pumpAndSettle();
      expect(locationOf(router), '/fitness');
    });

    testWidgets('a logged workout shows beside the next one', (tester) async {
      await pumpApp(tester, location: '/fitness');
      await tester.tap(find.byTooltip('Quick add'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Run'));
      await tester.pump();
      await tester.tap(find.text('45 min'));
      await tester.pump();
      await tester.tap(find.widgetWithText(FilledButton, 'Log workout'));
      await tester.pumpAndSettle();

      await tapBar(tester, 'Home');

      expect(_inCard('workout', 'Logged today'), findsOneWidget);
      expect(_inCard('workout', 'Run · 45 min'), findsOneWidget);
      expect(_inCard('workout', 'Upper body strength'), findsOneWidget);
    });
  });

  group('the inbox preview', () {
    testWidgets('says how many suggestions are waiting and what the first is', (
      tester,
    ) async {
      await pumpApp(tester);

      final card = find.byKey(const Key('inbox-preview'));
      expect(
        find.descendant(of: card, matching: find.text('3 suggestions')),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: card,
          matching: find.text("Lighten today's task load and 2 more"),
        ),
        findsOneWidget,
      );
    });

    testWidgets('a badge on the app bar carries the same count', (
      tester,
    ) async {
      await pumpApp(tester);

      final badge = tester.widget<Badge>(find.byType(Badge));
      expect(badge.isLabelVisible, isTrue);
      expect((badge.label! as Text).data, '3');
    });

    testWidgets(
      'spans every domain a suggestion touches, without picking a side',
      (tester) async {
        await pumpApp(tester);

        final dots = tester.widget<DomainDots>(
          find.descendant(
            of: find.byKey(const Key('inbox-preview')),
            matching: find.byType(DomainDots),
          ),
        );
        expect(dots.domains.toSet(), {
          AppDestination.fitness,
          AppDestination.tasks,
          AppDestination.habits,
          AppDestination.meals,
          AppDestination.finance,
        });
      },
    );

    testWidgets('the card opens the inbox, and back returns to Today', (
      tester,
    ) async {
      final router = await pumpApp(tester);

      await tester.tap(find.byKey(const Key('inbox-preview')));
      await tester.pumpAndSettle();

      expect(locationOf(router), '/home/inbox');
      expect(appBarTitle('Inbox'), findsOneWidget);
      expect(find.text('Coming in Phase 10'), findsOneWidget);
      expect(find.byTooltip('Quick add'), findsNothing);

      await tester.tap(backButton);
      await tester.pumpAndSettle();
      expect(locationOf(router), '/home');
      expect(appBarTitle('Today'), findsOneWidget);
    });

    testWidgets('the app bar badge opens it too', (tester) async {
      final router = await pumpApp(tester);

      await tester.tap(find.byTooltip('Inbox, 3 suggestions'));
      await tester.pumpAndSettle();

      expect(locationOf(router), '/home/inbox');
    });
  });

  group('a quiet day', () {
    testWidgets('is still Today, not the first-run welcome', (tester) async {
      await pumpApp(tester, scenario: TodayScenario.quietDay);

      expect(find.text('Welcome to Synos'), findsNothing);
      expect(find.text('Saturday, 26 September'), findsOneWidget);
    });

    testWidgets(
      'gives every empty section one plain sentence and one way to add',
      (tester) async {
        await pumpApp(tester, scenario: TodayScenario.quietDay);

        expect(_inCard('meals', 'No meals planned for today.'), findsOneWidget);
        expect(_inCard('meals', 'Plan a meal'), findsOneWidget);
        expect(_inCard('budget', 'No weekly budget set.'), findsOneWidget);
        expect(_inCard('budget', 'Set a budget'), findsOneWidget);
        expect(
          _inCard('workout', 'Rest day. Nothing is scheduled.'),
          findsOneWidget,
        );
        expect(_inCard('workout', 'Log a workout'), findsOneWidget);
        // ... and the sections that do have something are unchanged.
        expect(_inCard('schedule', 'Dentist check-up'), findsOneWidget);
        expect(_inCard('priorities', '2 open'), findsOneWidget);
        expect(_inCard('habits', '0 of 3'), findsOneWidget);
      },
    );

    testWidgets('has no inbox card and no badge when nothing is waiting', (
      tester,
    ) async {
      await pumpApp(tester, scenario: TodayScenario.quietDay);

      expect(find.byKey(const Key('inbox-preview')), findsNothing);
      expect(tester.widget<Badge>(find.byType(Badge)).isLabelVisible, isFalse);
      expect(find.byTooltip('Inbox'), findsOneWidget);
    });

    testWidgets('shows a dash where there is nothing to count', (tester) async {
      await pumpApp(tester, scenario: TodayScenario.quietDay);

      expect(
        _inGlance('–'),
        findsNWidgets(3),
        reason: 'meals, budget and workout',
      );
      expect(_inGlance('0/3'), findsOneWidget);
    });

    for (final (action, noun) in [
      ('Plan a meal', 'New meal'),
      ('Set a budget', 'New expense'),
      ('Log a workout', 'New workout'),
    ]) {
      testWidgets(
        '"$action" opens quick add on the right form, over the whole app',
        (tester) async {
          await pumpApp(tester, scenario: TodayScenario.quietDay);

          await tapVisible(tester, find.text(action));

          expect(find.text(noun), findsOneWidget);
          // Opened from inside the Home destination, yet it covers the bar.
          final sheet = tester.getRect(find.byType(BottomSheet));
          final bar = tester.getRect(find.byType(NavigationBar));
          expect(sheet.top, lessThan(bar.top));
          expect(sheet.bottom, greaterThanOrEqualTo(bar.bottom));
        },
      );
    }

    testWidgets('an empty section is filled by what quick add saves into it', (
      tester,
    ) async {
      await pumpApp(tester, scenario: TodayScenario.quietDay);

      await tapVisible(tester, find.text('Plan a meal'));
      await tester.enterText(find.byType(TextFormField).first, 'Lentil soup');
      await tester.tap(find.widgetWithText(FilledButton, 'Add meal'));
      await tester.pumpAndSettle();

      expect(find.text('Meal added'), findsOneWidget);
      expect(_inCard('meals', 'Lentil soup'), findsOneWidget);
      expect(_inCard('meals', 'No meals planned for today.'), findsNothing);
      expect(_inCard('meals', '0 of 1 logged'), findsOneWidget);
    });

    testWidgets(
      'a budget-less week accepts an expense without pretending it counted',
      (tester) async {
        await pumpApp(tester, scenario: TodayScenario.quietDay);

        await tapVisible(tester, find.text('Set a budget'));
        await tester.enterText(find.byType(TextFormField).first, '30');
        await tester.tap(find.widgetWithText(FilledButton, 'Log expense'));
        await tester.pumpAndSettle();

        expect(_inCard('budget', 'No weekly budget set.'), findsOneWidget);
      },
    );
  });

  group('over budget', () {
    testWidgets('says so plainly, in the one alert color, and only there', (
      tester,
    ) async {
      await pumpApp(tester, scenario: TodayScenario.overBudget);

      expect(_inCard('budget', '\$31'), findsOneWidget);
      expect(_inCard('budget', 'over budget'), findsOneWidget);
      expect(
        _inCard('budget', 'Spent \$431 · Groceries \$149 · Dining \$112'),
        findsOneWidget,
      );
      expect(_inGlance('Over'), findsOneWidget);
      final bar = tester.widget<LinearProgressIndicator>(
        find.descendant(
          of: _card('budget'),
          matching: find.byType(LinearProgressIndicator),
        ),
      );
      expect(bar.color, AppColors.danger);
      expect(bar.value, 1);

      final uses = _alertUses(tester);
      expect(uses, isNotEmpty);
      // Nothing outside the budget card and the glance row is red.
      var inBudget = 0;
      for (final scope in [_card('budget'), _glance()]) {
        for (final e
            in find
                .descendant(of: scope, matching: find.byType(Text))
                .evaluate()) {
          if (_isAlert((e.widget as Text).style?.color)) inBudget++;
        }
        for (final e
            in find
                .descendant(of: scope, matching: find.byType(Icon))
                .evaluate()) {
          if (_isAlert((e.widget as Icon).color)) inBudget++;
        }
        for (final e
            in find
                .descendant(
                  of: scope,
                  matching: find.byType(LinearProgressIndicator),
                )
                .evaluate()) {
          if (_isAlert((e.widget as LinearProgressIndicator).color)) inBudget++;
        }
      }
      expect(uses, hasLength(inBudget));
    });

    testWidgets('uses the lifted red for text on a dark surface', (
      tester,
    ) async {
      await pumpApp(
        tester,
        scenario: TodayScenario.overBudget,
        themeMode: ThemeMode.dark,
      );

      final text = tester.widget<Text>(_inCard('budget', 'over budget'));
      expect(text.style?.color, AppColors.dangerOnDark);
    });

    testWidgets(
      'an expense that tips a week over turns the card to the alert',
      (tester) async {
        await pumpApp(tester, location: '/finance');
        await tester.tap(find.byTooltip('Quick add'));
        await tester.pumpAndSettle();
        await tester.enterText(find.byType(TextFormField).first, '300');
        await tester.tap(find.widgetWithText(FilledButton, 'Log expense'));
        await tester.pumpAndSettle();

        await tapBar(tester, 'Home');

        expect(_inCard('budget', 'over budget'), findsOneWidget);
        expect(_inCard('budget', '\$88'), findsOneWidget); // 188.40 + 300 - 400
      },
    );
  });

  group('loading, failing and switching', () {
    testWidgets('shows the shape of the day while it loads', (tester) async {
      await pumpApp(
        tester,
        settle: false,
        todayRepository: _CountingRepository(
          latency: const Duration(seconds: 1),
        ),
      );

      expect(find.byType(TodaySkeleton), findsOneWidget);
      expect(find.text('Saturday, 26 September'), findsNothing);

      await tester.pump(const Duration(seconds: 2));
      await tester.pump();
      expect(find.byType(TodaySkeleton), findsNothing);
      expect(find.text('Saturday, 26 September'), findsOneWidget);
    });

    testWidgets('a load that fails shows the error, not an empty day', (
      tester,
    ) async {
      await pumpApp(tester, todayRepository: _CountingRepository(failFrom: 1));

      expect(find.text('No connection'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
      expect(find.text('Saturday, 26 September'), findsNothing);
      expect(find.text('Welcome to Synos'), findsNothing);
    });

    testWidgets('the retry button loads again', (tester) async {
      final repo = _RecoveringRepository();
      await pumpApp(tester, todayRepository: repo);
      expect(find.text('Retry'), findsOneWidget);

      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();

      expect(repo.fetches, 2);
      expect(find.text('Saturday, 26 September'), findsOneWidget);
      expect(find.text('No connection'), findsNothing);
    });

    testWidgets(
      'the debug menu switches between days, and an error replaces the old day',
      (tester) async {
        await pumpApp(tester, switchableScenarios: true);
        Future<void> choose(String label) async {
          await tester.tap(find.byTooltip('Preview data (debug only)'));
          await tester.pumpAndSettle();
          await tester.tap(find.text(label));
          await tester.pumpAndSettle();
        }

        await choose('Quiet day (some sections empty)');
        expect(find.text('Dentist check-up'), findsOneWidget);
        expect(_inCard('meals', 'No meals planned for today.'), findsOneWidget);

        await choose('Load error');
        expect(find.text('No connection'), findsOneWidget);
        expect(
          find.text('Dentist check-up'),
          findsNothing,
          reason: 'not the old day behind an error',
        );

        await choose('First run (nothing set up)');
        expect(find.text('Welcome to Synos'), findsOneWidget);

        await choose('Busy day');
        expect(find.text('Team standup'), findsOneWidget);
      },
    );
  });

  group('pull to refresh', () {
    for (final scenario in [
      TodayScenario.populated,
      TodayScenario.quietDay,
      TodayScenario.firstRun,
    ]) {
      testWidgets(
        'reloads from the ${scenario.name} screen, however short it is',
        (tester) async {
          final repo = _CountingRepository(scenario: scenario);
          await pumpApp(tester, todayRepository: repo);
          expect(find.byType(RefreshIndicator), findsOneWidget);
          expect(repo.fetches, 1);

          await _drag(tester);

          expect(repo.fetches, 2);
          expect(tester.takeException(), isNull);
        },
      );
    }

    testWidgets('keeps what you checked off', (tester) async {
      final repo = _CountingRepository();
      await pumpApp(tester, todayRepository: repo);
      await tapVisible(tester, _inCard('habits', 'Read 20 pages'));

      await _drag(tester);

      expect(_inCard('habits', '3 of 6'), findsOneWidget);
    });

    testWidgets('a refresh that fails keeps the day and says so once', (
      tester,
    ) async {
      final repo = _CountingRepository(failFrom: 2);
      await pumpApp(tester, todayRepository: repo);

      await tester.drag(find.byType(ListView).first, const Offset(0, 400));
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      await tester.pump(const Duration(milliseconds: 500));

      expect(
        find.text("Couldn't refresh. Pull down to try again."),
        findsOneWidget,
      );
      expect(find.text('Saturday, 26 September'), findsOneWidget);
      expect(find.text('No connection'), findsNothing);
    });

    testWidgets('can also be pulled on the error screen', (tester) async {
      final repo = _RecoveringRepository();
      await pumpApp(tester, todayRepository: repo);
      expect(find.text('No connection'), findsOneWidget);

      await _drag(tester);

      expect(repo.fetches, 2);
      expect(find.text('Saturday, 26 September'), findsOneWidget);
    });
  });

  group('layout and accessibility', () {
    testWidgets('stacks the cards in one column on a phone', (tester) async {
      await pumpApp(tester);

      final schedule = tester.getRect(_card('schedule'));
      final priorities = tester.getRect(_card('priorities'));
      expect(priorities.left, schedule.left);
      expect(priorities.top, greaterThanOrEqualTo(schedule.bottom));
    });

    testWidgets(
      'stays one column on a tablet, where the rail leaves too little room',
      (tester) async {
        await pumpApp(tester, size: tabletSize);

        final schedule = tester.getRect(_card('schedule'));
        final priorities = tester.getRect(_card('priorities'));
        expect(priorities.left, schedule.left);
        expect(priorities.top, greaterThanOrEqualTo(schedule.bottom));
      },
    );

    for (final size in [const Size(1000, 900), desktopSize]) {
      testWidgets(
        'sets time and money beside things to do at ${size.width.toInt()} wide',
        (tester) async {
          await pumpApp(tester, size: size);

          final schedule = tester.getRect(_card('schedule'));
          final priorities = tester.getRect(_card('priorities'));
          expect(priorities.left, greaterThan(schedule.right - 1));
          expect(priorities.top, schedule.top);
          expect(tester.getRect(_card('meals')).left, schedule.left);
          expect(tester.getRect(_card('workout')).left, priorities.left);
        },
      );
    }

    testWidgets('leaves room under the last card for the floating button', (
      tester,
    ) async {
      await pumpApp(tester);

      final list = tester.widget<ListView>(find.byType(ListView).first);
      expect((list.padding! as EdgeInsets).bottom, AppInsets.fabClearance);
    });

    testWidgets('folds the glance row into two rows at large text sizes', (
      tester,
    ) async {
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(tester.platformDispatcher.clearAllTestValues);
      await pumpApp(tester);

      expect(tester.takeException(), isNull);
      final events = tester.getTopLeft(_inGlance('Events')).dy;
      final meals = tester.getTopLeft(_inGlance('Meals')).dy;
      expect(meals, greaterThan(events));
    });

    for (final scenario in [
      TodayScenario.populated,
      TodayScenario.overBudget,
      TodayScenario.quietDay,
    ]) {
      testWidgets(
        'keeps every row inside its card at large text sizes (${scenario.name})',
        (tester) async {
          tester.platformDispatcher.textScaleFactorTestValue = 2;
          addTearDown(tester.platformDispatcher.clearAllTestValues);
          await pumpApp(tester, scenario: scenario);

          // Walk the whole screen: a row only lays out once it is built.
          for (var i = 0; i < 14; i++) {
            await tester.drag(
              find.byType(ListView).first,
              const Offset(0, -500),
            );
            await tester.pumpAndSettle();
          }

          expect(tester.takeException(), isNull);
        },
      );
    }

    testWidgets('fits a very narrow phone', (tester) async {
      await pumpApp(tester, size: const Size(320, 640));

      expect(tester.takeException(), isNull);
    });

    testWidgets('renders in dark mode', (tester) async {
      await pumpApp(tester, themeMode: ThemeMode.dark);

      expect(tester.takeException(), isNull);
      expect(find.text('Saturday, 26 September'), findsOneWidget);
    });

    testWidgets('reads out what each row is and its state', (tester) async {
      final handle = tester.ensureSemantics();
      await pumpApp(tester);

      expect(
        find.bySemanticsLabel(
          'Finalize Q4 planning outline, High priority · Due 12:00 · about 2 hours',
        ),
        findsOneWidget,
      );
      expect(
        find.bySemanticsLabel('Morning stretch, 12-day streak'),
        findsOneWidget,
      );
      expect(find.bySemanticsLabel('Tasks: 5'), findsOneWidget);
      expect(
        find.bySemanticsLabel(
          "3 suggestions waiting. Lighten today's task load and 2 more",
        ),
        findsOneWidget,
      );
      expect(
        find.bySemanticsLabel(
          RegExp('Chickpea salad bowl, Lunch · 12:30 PM · 610 kcal'),
        ),
        findsOneWidget,
      );
      handle.dispose();
    });
  });
}

/// Fails the first load, then works.
class _RecoveringRepository extends MockTodayRepository {
  _RecoveringRepository()
    : super(
        scenario: TodayScenario.populated,
        now: testNow,
        latency: Duration.zero,
      );

  int fetches = 0;

  @override
  Future<TodaySnapshot> fetch() async {
    fetches++;
    if (fetches == 1) throw const TodayLoadException();
    return super.fetch();
  }
}
