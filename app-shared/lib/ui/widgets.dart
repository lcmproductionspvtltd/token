// The shared widgets both BQuee apps use, one file per kind (see ui/widgets/):
//   feedback  toasts, error messages, confirm dialogs, opening links
//   buttons   Btn and round icon buttons
//   cards     AppCard, ListCard, tags, card actions
//   filters   search box, filter chips, section titles
//   marks     pills, images, avatars, business marks
//   figures   number cards at the top of dashboards
//   states    empty / loading / error
//   pagination  pages of long lists
//   forms     fields, switches, dropdowns, image picker, form page, swatches
//   keyboard  closes the keyboard when tapping outside a text field
// Import this one file to get them all.

export 'theme.dart' show brandOf;
export 'widgets/feedback.dart';
export 'widgets/buttons.dart';
export 'widgets/cards.dart';
export 'widgets/filters.dart';
export 'widgets/marks.dart';
export 'widgets/figures.dart';
export 'widgets/states.dart';
export 'widgets/pagination.dart';
export 'widgets/forms.dart';
export 'widgets/keyboard.dart';
