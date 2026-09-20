import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/nav_args.dart';
import '../../../../core/router/route_paths.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/widgets/widgets.dart';
import '../../application/otp_controller.dart';
import '../widgets/auth_scaffold.dart';
import '../widgets/form_error_banner.dart';
import '../widgets/otp_code_field.dart';

class OtpVerificationScreen extends ConsumerStatefulWidget {
  const OtpVerificationScreen({super.key, required this.args});

  final OtpFlowArgs args;

  @override
  ConsumerState<OtpVerificationScreen> createState() =>
      _OtpVerificationScreenState();
}

class _OtpVerificationScreenState extends ConsumerState<OtpVerificationScreen> {
  String _code = '';
  bool _submittedOnce = false;
  Timer? _timer;
  int _cooldown = 30;

  @override
  void initState() {
    super.initState();
    _startCooldown();
  }

  void _startCooldown() {
    _cooldown = 30;
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_cooldown <= 1) {
        timer.cancel();
        setState(() => _cooldown = 0);
      } else {
        setState(() => _cooldown -= 1);
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  bool get _isSignUp => widget.args.purpose == OtpPurpose.signUpVerification;

  Future<void> _verify() async {
    setState(() => _submittedOnce = true);
    if (_code.length != 6) return;
    FocusScope.of(context).unfocus();

    final result = await ref
        .read(otpControllerProvider.notifier)
        .verify(email: widget.args.email, otp: _code);

    if (!mounted || !result.success) return;

    if (_isSignUp) {
      context.go(RoutePaths.accountSetup);
    } else {
      context.pushReplacement(
        RoutePaths.resetPassword,
        extra: ResetPasswordArgs(email: widget.args.email, otp: _code),
      );
    }
  }

  Future<void> _resend() async {
    if (_cooldown > 0) return;
    await ref.read(otpControllerProvider.notifier).resend(email: widget.args.email);
    if (!mounted) return;
    _startCooldown();
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('A new code has been sent.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(otpControllerProvider);
    final showFieldError = _submittedOnce && _code.length != 6;

    return AuthScaffold(
      title: _isSignUp ? 'Verify your email' : 'Enter reset code',
      subtitle: 'We sent a 6-digit code to ${widget.args.email}.',
      children: [
        if (state.isError)
          FormErrorBanner(
            message: state.errorMessage ?? 'Something went wrong.',
            isNetworkError: state.isNetworkError,
          ),
        OtpCodeField(
          enabled: !state.isSubmitting,
          hasError: state.isError || showFieldError,
          onChanged: (value) => setState(() => _code = value),
        ),
        if (showFieldError) ...[
          const SizedBox(height: AppSpacing.xxs),
          Text(
            'Enter the 6-digit code',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: Theme.of(context).colorScheme.error),
          ),
        ],
        const SizedBox(height: AppSpacing.md),
        PrimaryButton(
          label: 'Verify',
          isLoading: state.isSubmitting,
          onPressed: _verify,
        ),
        const SizedBox(height: AppSpacing.sm),
        Center(
          child: state.isResending
              ? const SizedBox(
                  height: 16,
                  width: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : TextButton(
                  onPressed: _cooldown > 0 ? null : _resend,
                  child: Text(
                    _cooldown > 0
                        ? 'Resend code in ${_cooldown}s'
                        : 'Resend code',
                  ),
                ),
        ),
      ],
    );
  }
}
