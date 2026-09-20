/// Minimal profile shape produced by account setup. Placeholder until the
/// NestJS backend defines the real user model.
class AppUser {
  const AppUser({
    required this.id,
    required this.email,
    required this.name,
    this.bio,
    this.avatarPath,
  });

  final String id;
  final String email;
  final String name;
  final String? bio;
  final String? avatarPath;
}
