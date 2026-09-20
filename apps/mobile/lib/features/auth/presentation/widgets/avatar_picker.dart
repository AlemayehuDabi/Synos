import 'package:flutter/material.dart';

import '../../../../core/theme/app_spacing.dart';
import '../../../../core/widgets/widgets.dart';

/// Tappable avatar placeholder. Opens a bottom sheet with photo-source
/// options — wire these to `image_picker` once the backend can accept
/// uploads; for now selecting an option just flips the placeholder state.
class AvatarPicker extends StatelessWidget {
  const AvatarPicker({
    super.key,
    required this.hasAvatar,
    required this.onChanged,
  });

  final bool hasAvatar;
  final ValueChanged<bool> onChanged;

  Future<void> _openPicker(BuildContext context) async {
    final theme = Theme.of(context);
    await showAppBottomSheet<void>(
      context: context,
      isScrollControlled: false,
      builder: (context) => Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Profile photo',
            style: theme.textTheme.headlineSmall,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: AppSpacing.sm),
          ListTile(
            leading: const Icon(Icons.photo_camera_outlined),
            title: const Text('Take photo'),
            onTap: () {
              onChanged(true);
              Navigator.of(context).pop();
            },
          ),
          ListTile(
            leading: const Icon(Icons.photo_library_outlined),
            title: const Text('Choose from gallery'),
            onTap: () {
              onChanged(true);
              Navigator.of(context).pop();
            },
          ),
          if (hasAvatar)
            ListTile(
              leading: Icon(
                Icons.delete_outline,
                color: theme.colorScheme.error,
              ),
              title: Text(
                'Remove photo',
                style: TextStyle(color: theme.colorScheme.error),
              ),
              onTap: () {
                onChanged(false);
                Navigator.of(context).pop();
              },
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Center(
      child: GestureDetector(
        onTap: () => _openPicker(context),
        child: Stack(
          children: [
            Container(
              width: 96,
              height: 96,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: hasAvatar
                    ? theme.colorScheme.primary.withValues(alpha: 0.12)
                    : theme.colorScheme.surfaceContainerHighest,
                border: Border.all(color: theme.dividerColor),
              ),
              child: Icon(
                hasAvatar ? Icons.person : Icons.person_outline,
                size: 44,
                color: hasAvatar
                    ? theme.colorScheme.primary
                    : theme.colorScheme.onSurfaceVariant,
              ),
            ),
            Positioned(
              right: 0,
              bottom: 0,
              child: Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: theme.colorScheme.primary,
                  border: Border.all(color: theme.colorScheme.surface, width: 2),
                ),
                child: const Icon(
                  Icons.photo_camera,
                  size: 15,
                  color: Colors.white,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
