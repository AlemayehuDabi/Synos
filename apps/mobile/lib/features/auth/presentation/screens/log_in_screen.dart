import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/route_paths.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/utils/validators.dart';
import '../../../../core/widgets/widgets.dart';
import '../../application/log_in_controller.dart';
import '../widgets/auth_scaffold.dart';
import '../widgets/form_error_banner.dart';
import '../widgets/social_login_button.dart';

class LogInScreen extends ConsumerStatefulWidget {
  const LogInScreen({super.key});

  @override
  ConsumerState<LogInScreen> createState() => _LogInScreenState();
}

class _LogInScreenState extends ConsumerState<LogInScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();

    final result = await ref
        .read(logInControllerProvider.notifier)
        .submit(email: _emailController.text.trim(), password: _passwordController.text);

    if (!mounted || !result.success) return;
    context.go(RoutePaths.home);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(logInControllerProvider);

    return AuthScaffold(
      title: 'Welcome back',
      subtitle: 'Log in to pick up where you left off.',
      showBackButton: false,
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
                hintText: 'Enter your password',
                obscureText: true,
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.password],
                validator: (v) => Validators.required(v, message: 'Enter your password'),
                onFieldSubmitted: (_) => _submit(),
                enabled: !state.isSubmitting,
              ),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: state.isSubmitting
                      ? null
                      : () => context.push(RoutePaths.forgotPassword),
                  child: const Text('Forgot password?'),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        PrimaryButton(
          label: 'Log in',
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
                : () => context.go(RoutePaths.signUp),
            child: const Text.rich(
              TextSpan(
                text: "Don't have an account? ",
                children: [
                  TextSpan(
                    text: 'Sign up',
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
