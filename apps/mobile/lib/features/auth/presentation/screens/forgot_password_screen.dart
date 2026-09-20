import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/nav_args.dart';
import '../../../../core/router/route_paths.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/utils/validators.dart';
import '../../../../core/widgets/widgets.dart';
import '../../application/forgot_password_controller.dart';
import '../widgets/auth_scaffold.dart';
import '../widgets/form_error_banner.dart';

class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();

    final result = await ref
        .read(forgotPasswordControllerProvider.notifier)
        .submit(email: _emailController.text.trim());

    if (!mounted || !result.success) return;
    context.push(
      RoutePaths.otpVerification,
      extra: OtpFlowArgs(
        email: result.email ?? _emailController.text.trim(),
        purpose: OtpPurpose.passwordReset,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(forgotPasswordControllerProvider);

    return AuthScaffold(
      title: 'Forgot password?',
      subtitle: "Enter your email and we'll send you a verification code.",
      children: [
        if (state.isError)
          FormErrorBanner(
            message: state.errorMessage ?? 'Something went wrong.',
            isNetworkError: state.isNetworkError,
          ),
        Form(
          key: _formKey,
          autovalidateMode: AutovalidateMode.onUserInteraction,
          child: TextInputField(
            label: 'Email',
            controller: _emailController,
            hintText: 'you@example.com',
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.done,
            autofillHints: const [AutofillHints.email],
            validator: Validators.email,
            enabled: !state.isSubmitting,
            onFieldSubmitted: (_) => _submit(),
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        PrimaryButton(
          label: 'Send code',
          isLoading: state.isSubmitting,
          onPressed: _submit,
        ),
      ],
    );
  }
}
