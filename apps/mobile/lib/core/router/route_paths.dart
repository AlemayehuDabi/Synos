abstract final class RoutePaths {
  // Auth flow
  static const splash = '/splash';
  static const onboarding = '/onboarding';
  static const signUp = '/sign-up';
  static const logIn = '/log-in';
  static const forgotPassword = '/forgot-password';
  static const otpVerification = '/otp-verification';
  static const resetPassword = '/reset-password';
  static const accountSetup = '/account-setup';

  // App shell: one top-level path per destination. A domain's own screens
  // hang off its path (`/calendar/new`, `/calendar/:id`, `/calendar/:id/edit`);
  // see AppDestination for the helpers that build them.
  static const home = '/home';
  static const calendar = '/calendar';
  static const tasks = '/tasks';
  static const habits = '/habits';
  static const fitness = '/fitness';
  static const finance = '/finance';
  static const meals = '/meals';
  static const more = '/more';

  /// Nested under Home, so back returns to Today.
  static const inbox = '/home/inbox';
}
