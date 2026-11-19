#!/bin/bash
# Makes ready-to-build zip packages of both apps from the committed code:
#   app-packages/BQuee-Biz-<version>.zip and app-packages/BQuee-Customer-<version>.zip (kept in git)
# Each has the app source, a one-click "Build on Mac.command" and HOW TO BUILD.txt.
#   bash scripts/package-apps.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/app-packages"
mkdir -p "$DIST" && rm -f "$DIST"/*.zip
cd "$DIST"

package() { # folder  display-name  repo-dir  flutter-project  release-dir  build-prefix  file-prefix  app-id
  local name="$1" display="$2" dir="$3" project="$4" rel="$5" prefix="$6" friendly="$7" appid="$8"
  local version; version="$(grep '^version:' "$ROOT/$dir/pubspec.yaml" | awk '{print $2}')"   # e.g. 1.0.2+3
  local label="${version%%+*}-build${version##*+}"
  local D="$name-$label"
  mkdir -p "$D"
  git -C "$ROOT" archive --format=tar HEAD "$dir" app-shared material_ui cupertino_ui | tar -x -C "$D" && mv "$D/$dir" "$D/$name"   # app + shared code + our Material copy

  cat > "$D/Build on Mac.command" <<EOF
#!/bin/bash
# Builds the $display app on this Mac (Android + iPhone). Works from wherever this folder is.
# First run downloads the build tools into ~/bquee-sdk (needs internet, takes a while).
HERE="\$(cd "\$(dirname "\$0")" && pwd)"
APP="\$HERE/$name"
OUT="\$HERE/Builds"
mkdir -p "\$OUT"
cd "\$APP" || exit 1
START=\$(date +%s)
bash tool/build_mac.sh 2>&1 | tee "\$OUT/build-log.txt"
REL="\$APP/build/$rel"
if [ -f "\$REL/$prefix.apk" ] && [ "\$(stat -f %m "\$REL/$prefix.apk")" -ge "\$START" ]; then
  rm -f "\$OUT"/*.apk "\$OUT"/*.aab "\$OUT"/*.ipa
  for f in $prefix.apk $prefix.aab $prefix-unsigned.ipa $prefix.ipa; do [ -f "\$REL/\$f" ] && cp "\$REL/\$f" "\$OUT/\${f/$prefix/$friendly}"; done
  echo; echo "SUCCESS – finished files are in the Builds folder"
  open "\$OUT"
else
  echo; echo "BUILD FAILED – see Builds/build-log.txt"
fi
echo "You can close this window."
EOF
  chmod +x "$D/Build on Mac.command" "$D/$name/tool/"*.sh 2>/dev/null || true

  cat > "$D/HOW TO BUILD.txt" <<EOF
$display – app version ${version%%+*} (build ${version##*+}) – app id $appid
Works with the BQuee server https://salonq-8t3f.onrender.com

What's inside
  $name/                 the app's full source code (Flutter, no extra packages)
  app-shared/            code both BQuee apps share – keep it next to $name/
  material_ui/           Flutter's official Material widgets (our own copy, no download)
  cupertino_ui/          Flutter's official iPhone-style widgets, needed by material_ui
  Build on Mac.command   one-click build on a Mac
  HOW TO BUILD.txt       this file

------------------------------------------------------------
A. On a Mac (Android + iPhone)  – easiest
------------------------------------------------------------
1. Unzip this package anywhere (Downloads is fine).
2. Double-click "Build on Mac.command".
   If macOS says it can't be opened: right-click it → Open → Open.
3. First time only: it installs Java, Flutter and the Android tools into ~/bquee-sdk
   (internet needed, about 20–40 minutes). Later builds take a few minutes.
4. Finished files appear in the new "Builds" folder:
     $friendly.apk           Android – install directly on a phone
     $friendly.aab           Android – upload to Google Play
     $friendly-unsigned.ipa  iPhone  – needs Xcode (App Store) and your Apple team to sign
   For iPhone signing, put your Apple Team ID in $name/tool/apple_team.txt before building.

------------------------------------------------------------
B. On Windows or Linux (Android only – iPhone apps can only be built on a Mac)
------------------------------------------------------------
1. Install Flutter (stable) and Android Studio: https://docs.flutter.dev/get-started/install
   Then run:  flutter doctor --android-licenses   (accept all)
2. Unzip this package, open a terminal in the $name folder and run:
     (keep app-shared, material_ui and cupertino_ui next to $name – the app loads them from ../)
     flutter create --org com.bquee --project-name $project --platforms=android .
     flutter pub get
     flutter build apk --release
     flutter build appbundle --release
3. Finished files:
     build/app/outputs/flutter-apk/app-release.apk      (install on a phone)
     build/app/outputs/bundle/release/app-release.aab   (Google Play)

Note: Android builds are signed with a test key. Create your own upload key before
publishing on Google Play, and keep it safe – every future update must use the same key.
EOF
  zip -qr -X "$D.zip" "$D" && rm -rf "$D"
  echo "app-packages/$D.zip"
}

package BQuee-Biz "BQuee Biz" mobile bquee bquee-release BQuee BQuee-Biz com.bquee.app
package BQuee-Customer "BQuee (customer app)" customer bquee_customer bquee-customer-release BQuee-Customer BQuee-Customer com.bquee.customer
