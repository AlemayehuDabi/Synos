import 'package:flutter/material.dart';

import '../../../../core/theme/app_spacing.dart';

enum SocialProvider { google, apple }

/// UI-only social sign-in button. Wire [onPressed] to real OAuth once the
/// backend supports it — for now it's a visual affordance only.
class SocialLoginButton extends StatelessWidget {
  const SocialLoginButton({
    super.key,
    required this.provider,
    required this.onPressed,
  });

  final SocialProvider provider;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isGoogle = provider == SocialProvider.google;

    return OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        backgroundColor: theme.colorScheme.surface,
        side: BorderSide(color: theme.dividerColor),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            isGoogle ? Icons.g_mobiledata_rounded : Icons.apple_rounded,
            size: 24,
          ),
          const SizedBox(width: AppSpacing.xs),
          Text(
            isGoogle ? 'Continue with Google' : 'Continue with Apple',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

/// "── or ──" divider used between social buttons and the email/password
/// form.
class OrDivider extends StatelessWidget {
  const OrDivider({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Expanded(child: Divider(color: theme.dividerColor)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
          child: Text(
            'or',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ),
        Expanded(child: Divider(color: theme.dividerColor)),
      ],
    );
  }
}
