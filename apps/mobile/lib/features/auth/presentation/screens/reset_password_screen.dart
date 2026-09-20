import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/nav_args.dart';
import '../../../../core/router/route_paths.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/utils/validators.dart';
import '../../../../core/widgets/widgets.dart';
import '../../application/reset_password_controller.dart';
import '../widgets/auth_scaffold.dart';
import '../widgets/form_error_banner.dart';

class ResetPasswordScreen extends ConsumerStatefulWidget {
  const ResetPasswordScreen({super.key, required this.args});

  final ResetPasswordArgs args;

  @override
  ConsumerState<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends ConsumerState<ResetPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _passwordController = TextEditingController();
  final _confirmController = TextEditingController();

  @override
  void dispose() {
    _passwordController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();

    final result = await ref
        .read(resetPasswordControllerProvider.notifier)
        .submit(
          email: widget.args.email,
          otp: widget.args.otp,
          newPassword: _passwordController.text,
        );

    if (!mounted || !result.success) return;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(result.message ?? 'Password reset.')),
    );
    context.go(RoutePaths.logIn);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(resetPasswordControllerProvider);

    return AuthScaffold(
      title: 'Set a new password',
      subtitle: 'Choose a strong password you haven\'t used before.',
      children: [
        if (state.isError)
          FormErrorBanner(
            message: state.errorMessage ?? 'Something went wrong.',
            isNetworkError: state.isNetworkError,
          ),
        Form(
          key: _formKey,
          autovalidateMode: AutovalidateMode.onUserInteraction,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextInputField(
                label: 'New password',
                controller: _passwordController,
                hintText: 'At least 8 characters',
                obscureText: true,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.newPassword],
                validator: Validators.password,
                enabled: !state.isSubmitting,
              ),
              const SizedBox(height: AppSpacing.sm),
              TextInputField(
                label: 'Confirm new password',
                controller: _confirmController,
                hintText: 'Re-enter your password',
                obscureText: true,
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.newPassword],
                validator: Validators.confirmPassword(
                  () => _passwordController.text,
                ),
                onFieldSubmitted: (_) => _submit(),
                enabled: !state.isSubmitting,
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        PrimaryButton(
          label: 'Reset password',
          isLoading: state.isSubmitting,
          onPressed: _submit,
        ),
      ],
    );
  }
}
