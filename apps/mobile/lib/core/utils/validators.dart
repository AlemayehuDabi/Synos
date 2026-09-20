/// Shared form-field validators for auth screens.
abstract final class Validators {
  static final RegExp _emailPattern = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

  static String? email(String? value) {
    final trimmed = value?.trim() ?? '';
    if (trimmed.isEmpty) return 'Enter your email';
    if (!_emailPattern.hasMatch(trimmed)) return 'Enter a valid email';
    return null;
  }

  static String? password(String? value) {
    final v = value ?? '';
    if (v.isEmpty) return 'Enter a password';
    if (v.length < 8) return 'Use at least 8 characters';
    if (!RegExp(r'[A-Z]').hasMatch(v)) {
      return 'Include at least one uppercase letter';
    }
    if (!RegExp(r'[0-9]').hasMatch(v)) return 'Include at least one number';
    return null;
  }

  static String? Function(String?) confirmPassword(
    String Function() passwordGetter,
  ) {
    return (value) {
      if ((value ?? '').isEmpty) return 'Confirm your password';
      if (value != passwordGetter()) return 'Passwords do not match';
      return null;
    };
  }

  static String? required(String? value, {String message = 'Required'}) {
    if ((value ?? '').trim().isEmpty) return message;
    return null;
  }

  static String? otp(String? value, {int length = 6}) {
    final v = value ?? '';
    if (v.isEmpty) return 'Enter the verification code';
    if (v.length != length) return 'Enter the $length-digit code';
    if (!RegExp(r'^\d+$').hasMatch(v)) return 'Code must be numeric';
    return null;
  }
}
