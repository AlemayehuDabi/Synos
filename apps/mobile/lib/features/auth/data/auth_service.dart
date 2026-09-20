import 'models/auth_result.dart';

/// Auth API surface. This UI layer only depends on this interface —
/// swap [MockAuthService] for a real implementation backed by the NestJS
/// API once it exists, without touching any screen or controller.
abstract class AuthService {
  Future<AuthResult> signUp({required String email, required String password});

  Future<AuthResult> logIn({required String email, required String password});

  Future<void> logOut();

  /// Sends a password-reset verification code to [email].
  Future<AuthResult> resetPassword({required String email});

  /// Verifies a code sent for either sign-up or password-reset.
  Future<AuthResult> verifyOtp({required String email, required String otp});

  /// Requests a new verification code for [email].
  Future<AuthResult> resendOtp({required String email});

  /// Sets a new password after [otp] has already been verified.
  Future<AuthResult> confirmPasswordReset({
    required String email,
    required String otp,
    required String newPassword,
  });

  /// Saves the profile collected on the account-setup screen.
  Future<AuthResult> completeAccountSetup({
    required String name,
    String? bio,
    String? avatarPath,
  });
}

/// Mock implementation: simulates network latency and returns
/// deterministic success/failure so every screen's error state is easy to
/// exercise by hand.
///
/// Test hooks:
/// - Sign up with email `taken@synos.app` → "already registered" failure.
/// - Log in with email `offline@synos.app` → simulated network error.
/// - Any other log in with a wrong-looking password (< 8 chars) → invalid
///   credentials failure.
/// - Verification code `000000` → simulated network error, any code other
///   than `123456` → invalid code failure, `123456` → success.
class MockAuthService implements AuthService {
  static const _latency = Duration(milliseconds: 1100);

  @override
  Future<AuthResult> signUp({
    required String email,
    required String password,
  }) async {
    await Future.delayed(_latency);
    if (email.trim().toLowerCase() == 'taken@synos.app') {
      return AuthResult.failure('An account with this email already exists.');
    }
    if (email.trim().toLowerCase() == 'offline@synos.app') {
      return AuthResult.networkError();
    }
    return AuthResult.success(
      message: 'Account created. Check your email for a verification code.',
      email: email.trim(),
    );
  }

  @override
  Future<AuthResult> logIn({
    required String email,
    required String password,
  }) async {
    await Future.delayed(_latency);
    if (email.trim().toLowerCase() == 'offline@synos.app') {
      return AuthResult.networkError();
    }
    if (password.length < 8) {
      return AuthResult.failure('Incorrect email or password.');
    }
    return AuthResult.success(userId: 'mock-user-id', email: email.trim());
  }

  @override
  Future<void> logOut() async {
    await Future.delayed(_latency);
  }

  @override
  Future<AuthResult> resetPassword({required String email}) async {
    await Future.delayed(_latency);
    if (email.trim().toLowerCase() == 'offline@synos.app') {
      return AuthResult.networkError();
    }
    return AuthResult.success(
      message: 'If an account exists for this email, a code has been sent.',
      email: email.trim(),
    );
  }

  @override
  Future<AuthResult> verifyOtp({
    required String email,
    required String otp,
  }) async {
    await Future.delayed(_latency);
    if (otp == '000000') return AuthResult.networkError();
    if (otp != '123456') {
      return AuthResult.failure('That code is incorrect or has expired.');
    }
    return AuthResult.success(email: email.trim());
  }

  @override
  Future<AuthResult> resendOtp({required String email}) async {
    await Future.delayed(_latency);
    return AuthResult.success(message: 'A new code has been sent.');
  }

  @override
  Future<AuthResult> confirmPasswordReset({
    required String email,
    required String otp,
    required String newPassword,
  }) async {
    await Future.delayed(_latency);
    return AuthResult.success(message: 'Your password has been reset.');
  }

  @override
  Future<AuthResult> completeAccountSetup({
    required String name,
    String? bio,
    String? avatarPath,
  }) async {
    await Future.delayed(_latency);
    return AuthResult.success(message: 'Profile saved.');
  }
}
