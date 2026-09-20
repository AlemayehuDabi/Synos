import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'auth_service.dart';

/// Swap this single provider to point the app at a real NestJS-backed
/// [AuthService] implementation later.
final authServiceProvider = Provider<AuthService>((ref) => MockAuthService());
