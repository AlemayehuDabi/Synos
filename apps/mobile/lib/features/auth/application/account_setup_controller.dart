import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/auth_providers.dart';
import '../data/models/auth_result.dart';
import 'form_submission_state.dart';

final accountSetupControllerProvider =
    NotifierProvider<AccountSetupController, FormSubmissionState>(
      AccountSetupController.new,
    );

class AccountSetupController extends Notifier<FormSubmissionState> {
  @override
  FormSubmissionState build() => const FormSubmissionState();

  Future<AuthResult> submit({
    required String name,
    String? bio,
    String? avatarPath,
  }) async {
    state = state.copyWith(status: FormStatus.submitting);
    final result = await ref
        .read(authServiceProvider)
        .completeAccountSetup(name: name, bio: bio, avatarPath: avatarPath);

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
