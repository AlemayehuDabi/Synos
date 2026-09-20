import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/auth_providers.dart';
import '../data/models/auth_result.dart';
import 'form_submission_state.dart';

final logInControllerProvider =
    NotifierProvider<LogInController, FormSubmissionState>(
      LogInController.new,
    );

class LogInController extends Notifier<FormSubmissionState> {
  @override
  FormSubmissionState build() => const FormSubmissionState();

  Future<AuthResult> submit({
    required String email,
    required String password,
  }) async {
    state = state.copyWith(status: FormStatus.submitting);
    final result = await ref
        .read(authServiceProvider)
        .logIn(email: email, password: password);

    state = result.success
        ? state.copyWith(status: FormStatus.success)
        : state.copyWith(
            status: FormStatus.error,
            errorMessage: result.message,
            isNetworkError: result.isNetworkError,
          );
    return result;
  }

  void reset() => state = const FormSubmissionState();
}
