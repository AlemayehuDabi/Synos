enum FormStatus { idle, submitting, success, error }

/// Generic state for a screen that submits a form through [AuthService]:
/// idle → submitting → success | error. Screens watch this for
/// loading/error UI and listen to it to navigate on success.
class FormSubmissionState {
  const FormSubmissionState({
    this.status = FormStatus.idle,
    this.errorMessage,
    this.isNetworkError = false,
    this.successMessage,
  });

  final FormStatus status;
  final String? errorMessage;
  final bool isNetworkError;
  final String? successMessage;

  bool get isSubmitting => status == FormStatus.submitting;
  bool get isError => status == FormStatus.error;
  bool get isSuccess => status == FormStatus.success;

  FormSubmissionState copyWith({
    FormStatus? status,
    String? errorMessage,
    bool? isNetworkError,
    String? successMessage,
  }) {
    final resolvedStatus = status ?? this.status;
    return FormSubmissionState(
      status: resolvedStatus,
      errorMessage: resolvedStatus == FormStatus.error
          ? (errorMessage ?? this.errorMessage)
          : null,
      isNetworkError: resolvedStatus == FormStatus.error
          ? (isNetworkError ?? this.isNetworkError)
          : false,
      successMessage: successMessage ?? this.successMessage,
    );
  }
}
