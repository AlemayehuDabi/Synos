/// Outcome of an [AuthService] call. UI code should branch on [success] and
/// show [message] on failure; [userId]/[email] are populated on success
/// where relevant so callers can thread them into the next screen.
class AuthResult {
  const AuthResult._({
    required this.success,
    this.message,
    this.userId,
    this.email,
    this.isNetworkError = false,
  });

  factory AuthResult.success({String? message, String? userId, String? email}) =>
      AuthResult._(success: true, message: message, userId: userId, email: email);

  factory AuthResult.failure(String message) =>
      AuthResult._(success: false, message: message);

  /// A failure that represents a dropped/unreachable connection, as opposed
  /// to a validation or business-rule failure. UI can use this to show a
  /// dedicated network-error state instead of an inline field error.
  factory AuthResult.networkError([
    String message = 'Unable to connect. Check your internet connection and try again.',
  ]) => AuthResult._(success: false, message: message, isNetworkError: true);

  final bool success;
  final String? message;
  final String? userId;
  final String? email;
  final bool isNetworkError;
}
