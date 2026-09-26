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

## Design tokens

`lib/core/theme/`: a deep muted teal (`#1B4B4A`, `#2A6F6D` for interaction) on a
warm off-white (`#FAF8F5`) or warm near-black (`#12151A`); one muted accent per
domain (Calendar slate blue, Tasks slate gray, Habits sage, Fitness coral,
Finance amber, Meals terracotta); red (`#C0453D`) only for genuine alerts. The
accents tint icons and containers, they don't carry text: the amber is about
2.4:1 on the light background, so an icon in it always sits beside a label. On
dark surfaces interactive text uses `primaryOnDark`, a lifted teal that keeps
5.9:1. Spacing is the 8pt scale in `AppSpacing`.
