import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../layout/breakpoints.dart';

/// The one page scaffold every screen in the app shell builds on, so the app
/// bar looks and behaves the same everywhere:
///
/// * the title is left-aligned, in the theme's H3 style;
/// * a page you drilled into (a detail) gets a back arrow, which pops;
/// * a form (add/edit), which opens over the whole shell, gets a close icon
///   that pops instead of a back arrow;
/// * a root page gets no leading button - unless it has a [parentPath], in
///   which case the arrow goes there (a domain reached through More on a
///   compact window goes back to More).
///
/// Back means "up one level": it pops the page when there is one to pop, and
/// otherwise moves up the destination hierarchy to [parentPath]. That is also
/// what a page without a stack does when it was opened by a deep link.
class AppPage extends StatelessWidget {
  const AppPage({
    super.key,
    required this.title,
    required this.body,
    this.actions = const [],
    this.isForm = false,
    this.parentPath,
    this.floatingActionButton,
  });

  final String title;
  final Widget body;
  final List<Widget> actions;

  /// True for add/edit screens: shows a close icon instead of a back arrow.
  final bool isForm;

  /// Where back goes when there is nothing to pop. Null on a top-level page
  /// that should show no back button at all.
  final String? parentPath;

  final Widget? floatingActionButton;

  @override
  Widget build(BuildContext context) {
    // Per-page, unlike GoRouter.canPop: a list under an open detail is not
    // the page you're looking at, and must not grow a back arrow.
    final canPop = ModalRoute.of(context)?.canPop ?? false;
    final showLeading = canPop || parentPath != null;

    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        leading: showLeading
            ? _LeadingButton(
                isForm: isForm,
                onPressed: () => _goBack(context, canPop),
              )
            : null,
        title: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: actions,
      ),
      floatingActionButton: floatingActionButton,
      body: SafeArea(
        top: false,
        child: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(
              maxWidth: AppBreakpoints.contentMaxWidth,
            ),
            child: body,
          ),
        ),
      ),
    );
  }

  void _goBack(BuildContext context, bool canPop) {
    if (canPop) {
      context.pop();
    } else if (parentPath != null) {
      context.go(parentPath!);
    }
  }
}

class _LeadingButton extends StatelessWidget {
  const _LeadingButton({required this.isForm, required this.onPressed});

  final bool isForm;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final isCupertino = switch (Theme.of(context).platform) {
      TargetPlatform.iOS || TargetPlatform.macOS => true,
      _ => false,
    };
    final icon = isForm
        ? Icons.close_rounded
        : isCupertino
        ? Icons.arrow_back_ios_new_rounded
        : Icons.arrow_back_rounded;

    return IconButton(
      icon: Icon(icon),
      tooltip: isForm ? 'Close' : 'Back',
      onPressed: onPressed,
    );
  }
}
