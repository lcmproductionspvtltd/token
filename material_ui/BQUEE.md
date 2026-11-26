# material_ui 1.11.1 – BQuee's own copy

This is Flutter's official `material_ui` package, copied unchanged from pub.dev on 19 Nov 2026, so the
BQuee apps build without downloading it (self-contained).

What we changed (only in `pubspec.yaml`):
- removed `dev_dependencies` (the Flutter team's own test tools, not needed to build the apps)
- `cupertino_ui` points at our copy in `../cupertino_ui` instead of pub.dev

Only `lib/` and the licence/readme files are kept – not the package's tests or examples.

To update: on the Mac, double-click **Update material_ui (rarely).command** in the BQuee folder
(it downloads the newest material_ui and cupertino_ui into Project/, replacing these copies), then
redo the pubspec changes above. Licence: see LICENSE (BSD, the Flutter authors).
