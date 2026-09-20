import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/presentation/screens/account_setup_screen.dart';
import '../../features/auth/presentation/screens/forgot_password_screen.dart';
import '../../features/auth/presentation/screens/log_in_screen.dart';
import '../../features/auth/presentation/screens/onboarding_screen.dart';
import '../../features/auth/presentation/screens/otp_verification_screen.dart';
import '../../features/auth/presentation/screens/reset_password_screen.dart';
import '../../features/auth/presentation/screens/sign_up_screen.dart';
import '../../features/auth/presentation/screens/splash_screen.dart';
import '../../features/home/presentation/screens/home_placeholder_screen.dart';
import 'nav_args.dart';
import 'route_paths.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: RoutePaths.splash,
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
      GoRoute(
        path: RoutePaths.home,
        builder: (context, state) => const HomePlaceholderScreen(),
      ),
    ],
  );
});
