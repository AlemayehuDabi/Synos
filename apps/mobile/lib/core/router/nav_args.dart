enum OtpPurpose { signUpVerification, passwordReset }

/// Passed as `extra` when pushing [RoutePaths.otpVerification].
class OtpFlowArgs {
  const OtpFlowArgs({required this.email, required this.purpose});

  final String email;
  final OtpPurpose purpose;
}

/// Passed as `extra` when pushing [RoutePaths.resetPassword].
class ResetPasswordArgs {
  const ResetPasswordArgs({required this.email, required this.otp});

  final String email;
  final String otp;
}
