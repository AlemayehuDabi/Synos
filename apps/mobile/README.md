# Synos mobile

The Flutter app for Synos: Riverpod for state, go_router for navigation, Inter
via `google_fonts`.

```bash
flutter pub get
flutter run
flutter analyze
flutter test
```

Auth is a mock (`MockAuthService`, swapped through `authServiceProvider`), so
the app can be walked end to end without the API. The domains are placeholders
until their phase lands (below).

## Navigation shell

Everything after sign-in lives in one `StatefulShellRoute`
(`lib/core/router/app_router.dart`) with a branch per destination, so each keeps
its own back stack while another is showing. The destinations are the values of
`AppDestination` (`lib/core/navigation/app_destination.dart`), in order: Home,
Calendar, Tasks, Habits, Fitness, Finance, Meals, More. The router builds one
branch per value, and the bar, the rail, Home's tiles and More all read from
that same enum.

| Window width | Navigation |
| --- | --- |
| under 600 | Bottom bar: Home, Calendar, Tasks, Habits, **More**. More lists Fitness, Finance and Meals (the least frequent) and the account actions. |
| 600 to 1023 | Navigation rail with every destination, labels under the icons. |
| 1024 and up | Extended rail, labels beside the icons. Page content is centered at a maximum of 840. |

Resizing (rotation, a foldable, a desktop window) swaps the pattern in place and
keeps the current location.

### Routes

Every domain has the same four routes, built by `domainRoutes`
(`lib/core/router/domain_routes.dart`):

| Route | Screen | Presented as |
| --- | --- | --- |
| `/calendar` | list, the destination's root | a tab (or, under More, a page) |
| `/calendar/new` | add | full-screen form over the shell, close icon |
| `/calendar/:id` | detail | pushed inside the shell, the bar stays, back arrow |
| `/calendar/:id/edit` | edit | full-screen form over the shell, close icon |

`new` is reserved: it is never read as an id. Routes are nested, so a deep link
to `/calendar/abc/edit` still builds the detail and the list beneath it. Move
between screens with `context.go(...)` (so the URL stays truthful on web);
`AppDestination` has `newPath`, `detailPath(id)` and `editPath(id)`.

### Back

`AppPage` (`lib/core/navigation/app_page.dart`) is the page scaffold every
screen builds on, so the app bar is the same everywhere: a left-aligned title,
and a leading button that is

- a **back arrow** on a page you drilled into,
- a **close icon** on a form,
- **nothing** on a root page, unless it has a `parentPath` (a domain under More
  on a compact window goes up to More).

Back means "up one level". It pops the page if there is one, otherwise it moves
up the hierarchy. The system back button does the same: it pops what is nested,
then goes from a destination's root to Home (from a domain under More, to More
first), and from Home it leaves the app.

## Adding a domain's real screens

Each domain has `lib/features/<domain>/presentation/screens/<domain>_screens.dart`
with a `...ListScreen`, `...DetailScreen(id)` and `...FormScreen(id?)` (add when
`id` is null). They are placeholders that wrap `DomainPlaceholderScreen`. To
build a domain, replace those three widgets with real ones built on `AppPage`;
the router only knows those names, so nothing else changes.

The phase each domain lands in is `AppDestination.phase`; only the placeholders
read it, to say "Coming in Phase N", so it can go once the domain ships. In debug builds the list placeholders also
show two buttons that open a sample detail and edit form, to exercise the nested
routes.

## Today (Home)

Home is the Today view: the whole day across all six domains on one screen
(`lib/features/home/`). It is built to read as one system rather than six
widgets:

- **One card.** Every section is a `TodayCard`: the same surface, header (the
  domain's icon on a tint of its accent, a title, a short summary), padding and
  shadow. Accent colors only tint icons, rails and progress bars.
- **A row for the day.** Under the date, one number per domain (events, open
  tasks, habits done, meals logged, budget left, next workout), each a way into
  that domain.
- **Where domains touch.** The schedule mixes calendar events with the blocks
  other domains put on the calendar (a task's focus time, a workout, a meal),
  marked with the source's accent, and a card can carry a one-line note naming
  the two domains involved.
- **The inbox.** A card with the count of pending cross-domain suggestions and
  a badge on the app bar both open `/home/inbox`, a placeholder until Phase 10.

| State | What it shows |
| --- | --- |
| Loading | A skeleton shaped like the day |
| A day | The cards above. A section with nothing in it keeps its card, says so in one plain sentence and offers one way to add something |
| First run | Nothing set up in any domain: the welcome and a tile for each area |
| Load failed | "No connection" with Retry |
| Refresh failed | The day stays on screen, with a snackbar |

Pull down to refresh, on any of them. Checking off a task or a habit works
(the counts follow), and so does anything added through Quick Add.

Red appears once: going over the weekly budget. A missed habit, an overdue task
or an empty section is never red, and the copy stays plain (an overdue task is
"Due yesterday").

### The data is mock

Nothing here calls an API. `TodayRepository`
(`lib/features/home/data/today_repository.dart`) is the interface the screen
depends on; `MockTodayRepository` serves made-up days and remembers what the
user does to them, so a refresh returns their changes. To use the real API,
implement `TodayRepository` and point `todayRepositoryProvider` at it, the same
way `authServiceProvider` is swapped.

In debug builds a slider icon in Today's app bar switches the mock day, so every
state can be reviewed: a busy day, a quiet day with empty sections, first run,
over budget, and a load error.

## Quick add

The universal "+" (`lib/features/quick_add/`) floats over every top-level
destination on a phone, and sits at the top of the rail on a wider window. It
opens a sheet that covers the whole app: pick an area (event, task, habit,
workout, expense, meal), then fill in a short form. Opened from a domain's own
screen it goes straight to that domain's form; it can still go back and choose
another. What is entered is added to the Today data and confirmed in a
snackbar. On a phone it hides on a detail screen, where the domain's own edit
action belongs; on a wider window it stays in the rail.

## Design tokens

`lib/core/theme/`: a deep muted teal (`#1B4B4A`, `#2A6F6D` for interaction) on a
warm off-white (`#FAF8F5`) or warm near-black (`#12151A`); one muted accent per
domain (Calendar slate blue, Tasks slate gray, Habits sage, Fitness coral,
Finance amber, Meals terracotta); red (`#C0453D`) only for genuine alerts. The
accents tint icons and containers, they don't carry text: the amber is about
2.4:1 on the light background, so an icon in it always sits beside a label. On
dark surfaces interactive text uses `primaryOnDark`, a lifted teal that keeps
5.9:1, and alert text uses `dangerOnDark` for the same reason. Spacing is the
8pt scale in `AppSpacing`.
