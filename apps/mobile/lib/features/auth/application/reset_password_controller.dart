import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/auth_providers.dart';
import '../data/models/auth_result.dart';
import 'form_submission_state.dart';

final resetPasswordControllerProvider =
    NotifierProvider<ResetPasswordController, FormSubmissionState>(
      ResetPasswordController.new,
    );

class ResetPasswordController extends Notifier<FormSubmissionState> {
  @override
  FormSubmissionState build() => const FormSubmissionState();

  Future<AuthResult> submit({
    required String email,
    required String otp,
    required String newPassword,
  }) async {
    state = state.copyWith(status: FormStatus.submitting);
    final result = await ref
        .read(authServiceProvider)
        .confirmPasswordReset(email: email, otp: otp, newPassword: newPassword);

    state = result.success
        ? state.copyWith(
            status: FormStatus.success,
            successMessage: result.message,
          )
        : state.copyWith(
            status: FormStatus.error,
            errorMessage: result.message,
            isNetworkError: result.isNetworkError,
          );
    return result;
  }

  void reset() => state = const FormSubmissionState();
}
