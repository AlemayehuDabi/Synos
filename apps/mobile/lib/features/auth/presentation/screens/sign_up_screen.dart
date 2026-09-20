import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/nav_args.dart';
import '../../../../core/router/route_paths.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/utils/validators.dart';
import '../../../../core/widgets/widgets.dart';
import '../../application/sign_up_controller.dart';
import '../widgets/auth_scaffold.dart';
import '../widgets/form_error_banner.dart';
import '../widgets/social_login_button.dart';

class SignUpScreen extends ConsumerStatefulWidget {
  const SignUpScreen({super.key});

  @override
  ConsumerState<SignUpScreen> createState() => _SignUpScreenState();
}

class _SignUpScreenState extends ConsumerState<SignUpScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmController = TextEditingController();

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();

    final result = await ref
        .read(signUpControllerProvider.notifier)
        .submit(
          email: _emailController.text.trim(),
          password: _passwordController.text,
        );

    if (!mounted || !result.success) return;
    context.push(
      RoutePaths.otpVerification,
      extra: OtpFlowArgs(
        email: result.email ?? _emailController.text.trim(),
        purpose: OtpPurpose.signUpVerification,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(signUpControllerProvider);

    return AuthScaffold(
      title: 'Create your account',
      subtitle: 'Start managing your whole life in one place.',
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
                label: 'Email',
                controller: _emailController,
                hintText: 'you@example.com',
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.email],
                validator: Validators.email,
                enabled: !state.isSubmitting,
              ),
              const SizedBox(height: AppSpacing.sm),
              TextInputField(
                label: 'Password',
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
                label: 'Confirm password',
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
          label: 'Create account',
          isLoading: state.isSubmitting,
          onPressed: _submit,
        ),
        const SizedBox(height: AppSpacing.md),
        const OrDivider(),
        const SizedBox(height: AppSpacing.md),
        SocialLoginButton(
          provider: SocialProvider.google,
          onPressed: state.isSubmitting ? null : () {},
        ),
        const SizedBox(height: AppSpacing.xs),
        SocialLoginButton(
          provider: SocialProvider.apple,
          onPressed: state.isSubmitting ? null : () {},
        ),
        const SizedBox(height: AppSpacing.md),
        Center(
          child: TextButton(
            onPressed: state.isSubmitting
                ? null
                : () => context.go(RoutePaths.logIn),
            child: const Text.rich(
              TextSpan(
                text: 'Already have an account? ',
                children: [
                  TextSpan(
                    text: 'Log in',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
