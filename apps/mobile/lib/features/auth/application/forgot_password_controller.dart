import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/auth_providers.dart';
import '../data/models/auth_result.dart';
import 'form_submission_state.dart';

final forgotPasswordControllerProvider =
    NotifierProvider<ForgotPasswordController, FormSubmissionState>(
      ForgotPasswordController.new,
    );

class ForgotPasswordController extends Notifier<FormSubmissionState> {
  @override
  FormSubmissionState build() => const FormSubmissionState();

  Future<AuthResult> submit({required String email}) async {
    state = state.copyWith(status: FormStatus.submitting);
    final result = await ref.read(authServiceProvider).resetPassword(email: email);

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
