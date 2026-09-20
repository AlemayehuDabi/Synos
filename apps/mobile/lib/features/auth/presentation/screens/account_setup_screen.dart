import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/route_paths.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/utils/validators.dart';
import '../../../../core/widgets/widgets.dart';
import '../../application/account_setup_controller.dart';
import '../widgets/auth_scaffold.dart';
import '../widgets/avatar_picker.dart';
import '../widgets/form_error_banner.dart';

class AccountSetupScreen extends ConsumerStatefulWidget {
  const AccountSetupScreen({super.key});

  @override
  ConsumerState<AccountSetupScreen> createState() => _AccountSetupScreenState();
}

class _AccountSetupScreenState extends ConsumerState<AccountSetupScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _bioController = TextEditingController();
  bool _hasAvatar = false;

  @override
  void dispose() {
    _nameController.dispose();
    _bioController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();

    final result = await ref
        .read(accountSetupControllerProvider.notifier)
        .submit(
          name: _nameController.text.trim(),
          bio: _bioController.text.trim().isEmpty
              ? null
              : _bioController.text.trim(),
          avatarPath: _hasAvatar ? 'local://selected-avatar' : null,
        );

    if (!mounted || !result.success) return;
    context.go(RoutePaths.home);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(accountSetupControllerProvider);

    return AuthScaffold(
      title: 'Set up your profile',
      subtitle: 'This is how you\'ll show up across Synos.',
      showBackButton: false,
      children: [
        if (state.isError)
          FormErrorBanner(
            message: state.errorMessage ?? 'Something went wrong.',
            isNetworkError: state.isNetworkError,
          ),
        AvatarPicker(
          hasAvatar: _hasAvatar,
          onChanged: (value) => setState(() => _hasAvatar = value),
        ),
        const SizedBox(height: AppSpacing.lg),
        Form(
          key: _formKey,
          autovalidateMode: AutovalidateMode.onUserInteraction,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextInputField(
                label: 'Full name',
                controller: _nameController,
                hintText: 'Jordan Ellis',
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.name],
                validator: (v) =>
                    Validators.required(v, message: 'Enter your name'),
                enabled: !state.isSubmitting,
              ),
              const SizedBox(height: AppSpacing.sm),
              TextInputField(
                label: 'Bio (optional)',
                controller: _bioController,
                hintText: 'A short line about you',
                helperText: 'Shown on your profile. You can change this later.',
                maxLines: 3,
                maxLength: 140,
                enabled: !state.isSubmitting,
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        PrimaryButton(
          label: 'Finish setup',
          isLoading: state.isSubmitting,
          onPressed: _submit,
        ),
        const SizedBox(height: AppSpacing.xs),
        Center(
          child: TextButton(
            onPressed: state.isSubmitting
                ? null
                : () => context.go(RoutePaths.home),
            child: const Text('Skip for now'),
          ),
        ),
      ],
    );
  }
}
