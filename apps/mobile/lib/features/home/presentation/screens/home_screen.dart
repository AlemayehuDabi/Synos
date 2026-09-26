import 'package:flutter/material.dart';

import '../../../../core/navigation/app_page.dart';
import '../widgets/home_first_run_state.dart';

/// The Home destination. Until there is data to summarise it shows the
/// first-run state.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const AppPage(title: 'Home', body: HomeFirstRunState());
  }
}
