import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/auth_providers.dart';
import '../data/models/auth_result.dart';
import 'form_submission_state.dart';

/// Adds a separate resend-in-flight flag on top of [FormSubmissionState] so
/// the "resend code" link can show its own tiny spinner without disturbing
/// the primary verify button.
class OtpState extends FormSubmissionState {
  const OtpState({
    super.status,
    super.errorMessage,
    super.isNetworkError,
    super.successMessage,
    this.isResending = false,
  });

  final bool isResending;

  @override
  OtpState copyWith({
    FormStatus? status,
    String? errorMessage,
    bool? isNetworkError,
    String? successMessage,
    bool? isResending,
  }) {
    final base = super.copyWith(
      status: status,
      errorMessage: errorMessage,
      isNetworkError: isNetworkError,
      successMessage: successMessage,
    );
    return OtpState(
      status: base.status,
      errorMessage: base.errorMessage,
      isNetworkError: base.isNetworkError,
      successMessage: base.successMessage,
      isResending: isResending ?? this.isResending,
    );
  }
}

final otpControllerProvider = NotifierProvider<OtpController, OtpState>(
  OtpController.new,
);

class OtpController extends Notifier<OtpState> {
  @override
  OtpState build() => const OtpState();

  Future<AuthResult> verify({required String email, required String otp}) async {
    state = state.copyWith(status: FormStatus.submitting);
    final result = await ref
        .read(authServiceProvider)
        .verifyOtp(email: email, otp: otp);

    state = result.success
        ? state.copyWith(status: FormStatus.success)
        : state.copyWith(
            status: FormStatus.error,
            errorMessage: result.message,
            isNetworkError: result.isNetworkError,
          );
    return result;
  }

  Future<void> resend({required String email}) async {
    state = state.copyWith(isResending: true);
    final result = await ref.read(authServiceProvider).resendOtp(email: email);
    state = state.copyWith(
      isResending: false,
      successMessage: result.message,
    );
  }

  void reset() => state = const OtpState();
}
