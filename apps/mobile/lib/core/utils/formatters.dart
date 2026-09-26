import 'package:flutter/material.dart';

/// Display formatting shared by the dashboard cards. English only for now.
abstract final class Formatters {
  static const _weekdays = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];

  static const _months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  /// "Saturday, 26 September".
  static String dayHeading(DateTime date) =>
      '${_weekdays[date.weekday - 1]}, ${date.day} ${_months[date.month - 1]}';

  /// Whole dollars with thousands separators: "$1,250", "-$31". Rounds, so
  /// a budget of "$211.60 left" reads "$212".
  static String money(double amount) {
    final rounded = amount.abs().round();
    final grouped = rounded.toString().replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'),
      (_) => ',',
    );
    return '${amount < 0 && rounded != 0 ? '-' : ''}\$$grouped';
  }

  /// "45 min", "1 h", "1 h 30 min".
  static String duration(int minutes) {
    if (minutes < 60) return '$minutes min';
    final hours = minutes ~/ 60;
    final rest = minutes % 60;
    return rest == 0 ? '$hours h' : '$hours h $rest min';
  }

  /// "1 day", "3 days".
  static String plural(int count, String singular, [String? plural]) =>
      '$count ${count == 1 ? singular : plural ?? '${singular}s'}';

  /// A time in the device's own 12 or 24 hour style.
  static String time(BuildContext context, DateTime dateTime) {
    return MaterialLocalizations.of(context).formatTimeOfDay(
      TimeOfDay.fromDateTime(dateTime),
      alwaysUse24HourFormat: MediaQuery.alwaysUse24HourFormatOf(context),
    );
  }
}
