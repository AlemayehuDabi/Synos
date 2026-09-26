import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/calendar/presentation/screens/calendar_screens.dart';
import '../../features/finance/presentation/screens/finance_screens.dart';
import '../../features/fitness/presentation/screens/fitness_screens.dart';
import '../../features/habits/presentation/screens/habits_screens.dart';
import '../../features/meals/presentation/screens/meals_screens.dart';
import '../../features/more/presentation/screens/more_screen.dart';
import '../../features/tasks/presentation/screens/tasks_screens.dart';
import '../../features/auth/presentation/screens/account_setup_screen.dart';
import '../../features/auth/presentation/screens/forgot_password_screen.dart';
import '../../features/auth/presentation/screens/log_in_screen.dart';
import '../../features/auth/presentation/screens/onboarding_screen.dart';
import '../../features/auth/presentation/screens/otp_verification_screen.dart';
import '../../features/auth/presentation/screens/reset_password_screen.dart';
import '../../features/auth/presentation/screens/sign_up_screen.dart';
import '../../features/auth/presentation/screens/splash_screen.dart';
import '../../features/home/presentation/screens/home_screen.dart';
import '../../features/inbox/presentation/screens/inbox_screen.dart';
import '../navigation/app_destination.dart';
import '../navigation/app_shell.dart';
import 'domain_routes.dart';
import 'nav_args.dart';
import 'route_paths.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  final router = createAppRouter();
  ref.onDispose(router.dispose);
  return router;
});

/// Builds the app's router. A function rather than a constant so each call
/// gets its own navigator key, and so tests can start anywhere with
/// [initialLocation].
GoRouter createAppRouter({String initialLocation = RoutePaths.splash}) {
  // Forms open on this navigator, over the shell and its bar.
  final rootNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'root');

  return GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: initialLocation,
    routes: [
      GoRoute(
        path: RoutePaths.splash,
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        path: RoutePaths.onboarding,
        builder: (context, state) => const OnboardingScreen(),
      ),
      GoRoute(
        path: RoutePaths.signUp,
        builder: (context, state) => const SignUpScreen(),
      ),
      GoRoute(
        path: RoutePaths.logIn,
        builder: (context, state) => const LogInScreen(),
      ),
      GoRoute(
        path: RoutePaths.forgotPassword,
        builder: (context, state) => const ForgotPasswordScreen(),
      ),
      GoRoute(
        path: RoutePaths.otpVerification,
        builder: (context, state) {
          final args = state.extra;
          return OtpVerificationScreen(
            args: args is OtpFlowArgs
                ? args
                : const OtpFlowArgs(
                    email: '',
                    purpose: OtpPurpose.signUpVerification,
                  ),
          );
        },
      ),
      GoRoute(
        path: RoutePaths.resetPassword,
        builder: (context, state) {
          final args = state.extra;
          return ResetPasswordScreen(
            args: args is ResetPasswordArgs
                ? args
                : const ResetPasswordArgs(email: '', otp: ''),
          );
        },
      ),
      GoRoute(
        path: RoutePaths.accountSetup,
        builder: (context, state) => const AccountSetupScreen(),
      ),
      // The app proper: one branch per destination, so each keeps its own
      // back stack while another is showing.
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            AppShell(navigationShell: navigationShell),
        branches: [
          for (final destination in AppDestination.values)
            StatefulShellBranch(
              routes: _routesFor(destination, rootNavigatorKey),
            ),
        ],
      ),
    ],
  );
}

// Exhaustive on purpose: a new AppDestination doesn't compile until it has
// routes here, and its branch index follows its position in the enum.
List<RouteBase> _routesFor(
  AppDestination destination,
  GlobalKey<NavigatorState> rootNavigatorKey,
) {
  return switch (destination) {
    AppDestination.home => [
      GoRoute(
        path: destination.path,
        builder: (context, state) => const HomeScreen(),
        routes: [
          GoRoute(
            path: 'inbox',
            builder: (context, state) => const InboxScreen(),
          ),
        ],
      ),
    ],
    AppDestination.calendar => domainRoutes(
      destination: destination,
      rootNavigatorKey: rootNavigatorKey,
      list: () => const CalendarListScreen(),
      detail: (id) => CalendarDetailScreen(id: id),
      form: (id) => CalendarFormScreen(id: id),
    ),
    AppDestination.tasks => domainRoutes(
      destination: destination,
      rootNavigatorKey: rootNavigatorKey,
      list: () => const TasksListScreen(),
      detail: (id) => TasksDetailScreen(id: id),
      form: (id) => TasksFormScreen(id: id),
    ),
    AppDestination.habits => domainRoutes(
      destination: destination,
      rootNavigatorKey: rootNavigatorKey,
      list: () => const HabitsListScreen(),
      detail: (id) => HabitsDetailScreen(id: id),
      form: (id) => HabitsFormScreen(id: id),
    ),
    AppDestination.fitness => domainRoutes(
      destination: destination,
      rootNavigatorKey: rootNavigatorKey,
      list: () => const FitnessListScreen(),
      detail: (id) => FitnessDetailScreen(id: id),
      form: (id) => FitnessFormScreen(id: id),
    ),
    AppDestination.finance => domainRoutes(
      destination: destination,
      rootNavigatorKey: rootNavigatorKey,
      list: () => const FinanceListScreen(),
      detail: (id) => FinanceDetailScreen(id: id),
      form: (id) => FinanceFormScreen(id: id),
    ),
    AppDestination.meals => domainRoutes(
      destination: destination,
      rootNavigatorKey: rootNavigatorKey,
      list: () => const MealsListScreen(),
      detail: (id) => MealsDetailScreen(id: id),
      form: (id) => MealsFormScreen(id: id),
    ),
    AppDestination.more => [
      GoRoute(
        path: destination.path,
        builder: (context, state) => const MoreScreen(),
      ),
    ],
  };
}
