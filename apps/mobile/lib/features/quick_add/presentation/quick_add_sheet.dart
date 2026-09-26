import 'package:flutter/material.dart';

import '../../../core/navigation/app_destination.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/widgets/app_modal.dart';
import '../data/models/quick_entry.dart';
import 'quick_add_forms.dart';
import 'quick_add_widgets.dart';

/// Opens quick add over the whole app and returns what the user entered, or
/// null if they dismissed it. With [initialDomain] it opens straight on that
/// domain's form (the user can still go back and pick another).
Future<QuickEntry?> showQuickAddSheet(
  BuildContext context, {
  AppDestination? initialDomain,
}) {
  return showAppBottomSheet<QuickEntry>(
    context: context,
    useRootNavigator: true,
    builder: (context) => QuickAddSheet(initialDomain: initialDomain),
  );
}

class QuickAddSheet extends StatefulWidget {
  const QuickAddSheet({super.key, this.initialDomain});

  final AppDestination? initialDomain;

  @override
  State<QuickAddSheet> createState() => _QuickAddSheetState();
}

class _QuickAddSheetState extends State<QuickAddSheet> {
  late AppDestination? _domain = widget.initialDomain?.isDomain == true
      ? widget.initialDomain
      : null;

  void _submit(QuickEntry entry) => Navigator.of(context).pop(entry);

  @override
  Widget build(BuildContext context) {
    final domain = _domain;

    return SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Header(domain: domain, onBack: () => setState(() => _domain = null)),
          const SizedBox(height: AppSpacing.sm),
          AnimatedSize(
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOut,
            alignment: Alignment.topCenter,
            child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 200),
              switchInCurve: Curves.easeOut,
              child: domain == null
                  ? _DomainPicker(
                      key: const ValueKey('picker'),
                      onPick: (d) => setState(() => _domain = d),
                    )
                  : KeyedSubtree(
                      key: ValueKey(domain),
                      child: quickAddFormFor(domain, _submit),
                    ),
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.domain, required this.onBack});

  final AppDestination? domain;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final domain = this.domain;

    if (domain == null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Quick add', style: theme.textTheme.headlineSmall),
          Text('What would you like to add?', style: theme.textTheme.bodySmall),
        ],
      );
    }

    return Row(
      children: [
        IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          tooltip: 'Choose a different area',
          onPressed: onBack,
        ),
        DomainChip(domain: domain, size: 32),
        const SizedBox(width: AppSpacing.xs),
        Expanded(
          child: Text(
            'New ${domain.quickAddNoun.toLowerCase()}',
            style: theme.textTheme.headlineSmall,
          ),
        ),
      ],
    );
  }
}

/// A domain's icon on a tint of its accent: the small mark that says which
/// area something belongs to, used the same way everywhere.
class DomainChip extends StatelessWidget {
  const DomainChip({super.key, required this.domain, this.size = 36});

  final AppDestination domain;
  final double size;

  @override
  Widget build(BuildContext context) {
    final accent = domain.accent ?? Theme.of(context).colorScheme.primary;

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: accent.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(AppRadius.button - 2),
      ),
      child: Icon(domain.icon, color: accent, size: size * 0.55),
    );
  }
}

class _DomainPicker extends StatelessWidget {
  const _DomainPicker({super.key, required this.onPick});

  final ValueChanged<AppDestination> onPick;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        const gap = AppSpacing.xs;
        final tileWidth = (constraints.maxWidth - gap) / 2;

        return Wrap(
          spacing: gap,
          runSpacing: gap,
          children: [
            for (final domain in AppDestination.domains)
              SizedBox(
                width: tileWidth,
                child: _DomainTile(domain: domain, onTap: () => onPick(domain)),
              ),
          ],
        );
      },
    );
  }
}

class _DomainTile extends StatelessWidget {
  const _DomainTile({required this.domain, required this.onTap});

  final AppDestination domain;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Semantics(
      button: true,
      child: Material(
        color: theme.colorScheme.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.card),
          side: BorderSide(color: theme.dividerColor),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.sm - AppSpacing.xxs),
            child: Row(
              children: [
                DomainChip(domain: domain),
                const SizedBox(width: AppSpacing.xs + AppSpacing.xxs),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        domain.quickAddNoun,
                        style: theme.textTheme.titleMedium,
                      ),
                      Text(domain.label, style: theme.textTheme.bodySmall),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
