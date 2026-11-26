#!/bin/bash
# BQuee – one-shot setup + build on a Mac.
# Installs (into ~/bquee-sdk, nothing system-wide): Java 21, Flutter (stable), Android SDK.
# Then builds: Android APK + App Bundle, and the iOS app (needs Xcode from the App Store).
#
# Usage:   cd mobile && bash tool/build_mac.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SDK="$HOME/bquee-sdk"
# The tools folder used to be called ~/tokenq-sdk: move it once (a link keeps old paths working).
if [ -d "$HOME/tokenq-sdk" ] && [ ! -L "$HOME/tokenq-sdk" ] && [ ! -e "$SDK" ]; then
  mv "$HOME/tokenq-sdk" "$SDK" && ln -s "$SDK" "$HOME/tokenq-sdk"
fi
ARCH="$(uname -m)"            # x86_64 or arm64
mkdir -p "$SDK"
step() { printf '\n\033[1;35m==> %s\033[0m\n' "$1"; }

# 0. Xcode command line tools (git, unzip, clang)
if ! xcode-select -p >/dev/null 2>&1; then
  step "Installing Xcode command line tools – click Install in the popup, then run this script again"
  xcode-select --install || true
  exit 1
fi

# 1. Java 21 LTS (runs the Android build)
if [ ! -d "$SDK/jdk21" ]; then
  step "Downloading Java 21"
  JARCH=x64; [ "$ARCH" = arm64 ] && JARCH=aarch64
  curl -fL "https://api.adoptium.net/v3/binary/latest/21/ga/mac/$JARCH/jdk/hotspot/normal/eclipse" -o "$SDK/jdk.tar.gz"
  mkdir -p "$SDK/jdk21" && tar -xzf "$SDK/jdk.tar.gz" -C "$SDK/jdk21" --strip-components=1 && rm "$SDK/jdk.tar.gz"
fi
export JAVA_HOME="$SDK/jdk21/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"

# 2. Flutter (stable)
if [ ! -x "$SDK/flutter/bin/flutter" ]; then
  step "Downloading Flutter (stable)"
  git clone --depth 1 -b stable https://github.com/flutter/flutter.git "$SDK/flutter"
fi
export PATH="$SDK/flutter/bin:$PATH"
step "Updating Flutter to the newest stable release"
flutter upgrade --force || echo "(Flutter update skipped – using the installed version)"
flutter --version | head -1 || true
flutter config --no-analytics >/dev/null 2>&1 || true

# 3. Android SDK
export ANDROID_HOME="$SDK/android"
CT="$ANDROID_HOME/cmdline-tools"
if [ ! -x "$CT/latest/bin/sdkmanager" ]; then
  step "Downloading Android SDK tools"
  mkdir -p "$CT"
  curl -fL "https://dl.google.com/android/repository/commandlinetools-mac-11076708_latest.zip" -o "$SDK/cmdtools.zip"
  rm -rf "$CT/cmdline-tools" "$CT/latest"
  unzip -q -o "$SDK/cmdtools.zip" -d "$CT" && rm "$SDK/cmdtools.zip"
  mv "$CT/cmdline-tools" "$CT/latest"
fi
# The downloadable starter tools are old and warn about "SDK XML version 4".
# Use them once to install the newest command-line tools, then always use the newest.
if grep -q "^Pkg.Revision=12\." "$CT/latest/source.properties" 2>/dev/null; then
  step "Upgrading Android command-line tools to the newest version"
  rm -rf "$CT/bootstrap" && mv "$CT/latest" "$CT/bootstrap"
  yes | "$CT/bootstrap/bin/sdkmanager" --licenses 2>&1 | grep -v "SDK XML" >/dev/null || true
  "$CT/bootstrap/bin/sdkmanager" "cmdline-tools;latest" 2>&1 | grep -v "SDK XML" || true
  if [ -x "$CT/latest/bin/sdkmanager" ]; then rm -rf "$CT/bootstrap"; else mv "$CT/bootstrap" "$CT/latest"; fi
fi
export PATH="$CT/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
CT_VERSION="$(grep '^Pkg.Revision' "$CT/latest/source.properties" | cut -d= -f2)"
echo "Android command-line tools $CT_VERSION"

# sdkmanager now hands its work to Google's new Android CLI and prints a notice about that on
# every call. The work is the same, so the notice is left out of the build log.
sdk() {
  local out rc=0
  out="$(sdkmanager "$@" 2>&1)" || rc=$?
  printf '%s\n' "$out" | grep -v -E "is deprecated|Android CLI|'android sdk'|android-cli|--licenses option is no longer needed|^[[:space:]]*$" || true
  return $rc
}
step "Installing Android platform + build tools (accepting licences)"
# Tools before version 23 still ask for licences; newer ones don't need this step.
if [ "${CT_VERSION%%.*}" -lt 23 ]; then yes | sdkmanager --licenses >/dev/null 2>&1 || true; fi
sdk "platform-tools" "platforms;android-36" "build-tools;36.0.0" >/dev/null
step "Updating Android SDK packages"
sdk "cmdline-tools;latest" >/dev/null || true
sdk --update >/dev/null || true
flutter config --android-sdk "$ANDROID_HOME" >/dev/null
flutter config --jdk-dir "$JAVA_HOME" >/dev/null
java -version 2>&1 | head -1 || true

# 4. Project files + checks
cd "$APP_DIR"
step "Preparing the BQuee project"
# Flutter's Material widgets: our own copy next to this app folder (no download from pub.dev).
for PKG in material_ui cupertino_ui; do
  [ -d "$APP_DIR/../$PKG" ] || { echo "Missing ../$PKG – copy the $PKG folder next to this app folder."; exit 1; }
done
flutter create --org com.bquee --project-name bquee --platforms=android,ios . >/dev/null
# The app uses only Flutter's own packages and our copies above. A few of Flutter's have newer versions it
# pins; they arrive with the next Flutter release (updated at the top of this script).
PUB="$(flutter pub get 2>&1)" || { printf '%s\n' "$PUB"; exit 1; }
printf '%s\n' "$PUB" | grep -v -E "^  [a-z_]+ [0-9.]+ \([0-9.]+ available\)$|newer versions incompatible with dependency constraints|flutter pub outdated" || true
if printf '%s\n' "$PUB" | grep -q "available)"; then echo "(Some packages inside Flutter have newer versions – they update with the next Flutter release.)"; fi

# Gradle: fetch it with curl (Java's own download can time out) and point the wrapper at the local copy.
export JAVA_TOOL_OPTIONS="-Djava.net.preferIPv4Stack=true"
export GRADLE_OPTS="-Djava.net.preferIPv4Stack=true"
WRAP="android/gradle/wrapper/gradle-wrapper.properties"
GURL="$(grep '^distributionUrl=' "$WRAP" | cut -d= -f2- | sed 's#\\##g')"
GZIP="$SDK/$(basename "$GURL")"
if [ ! -s "$GZIP" ]; then
  step "Downloading Gradle ($(basename "$GURL"))"
  curl -fL "$GURL" -o "$GZIP.part" && mv "$GZIP.part" "$GZIP"
fi
sed -i '' "s#^distributionUrl=.*#distributionUrl=file\\://$GZIP#" "$WRAP"
flutter analyze --no-fatal-infos --no-fatal-warnings || true
# The code both apps share lives next to this app folder (../app-shared).
SHARED="$APP_DIR/../app-shared"
if [ -d "$SHARED" ]; then
  (cd "$SHARED" && flutter pub get >/dev/null && flutter analyze --no-fatal-infos --no-fatal-warnings) || true
else
  echo "Missing ../app-shared – copy the app-shared folder next to this app folder."; exit 1
fi
flutter test

# 5. Android
step "Building Android APK and App Bundle"
flutter build apk --release
flutter build appbundle --release
OUT="$APP_DIR/build/bquee-release"; mkdir -p "$OUT"
cp build/app/outputs/flutter-apk/app-release.apk "$OUT/BQuee.apk"
cp build/app/outputs/bundle/release/app-release.aab "$OUT/BQuee.aab"

# 6. iOS (needs full Xcode, not only the command line tools)
XCODE=""
for x in /Applications/Xcode.app "$HOME/Applications/Xcode.app" "$HOME/Downloads/Xcode.app" /Applications/Xcode-*.app; do
  [ -d "$x/Contents/Developer/Platforms/iPhoneOS.platform" ] && { XCODE="$x"; break; }
done
if [ -n "$XCODE" ]; then
  step "Building iOS app (Xcode at $XCODE)"
  export DEVELOPER_DIR="$XCODE/Contents/Developer"
  xcodebuild -version | head -1 || true
  # Signing: put your Apple Team ID in tool/apple_team.txt (Xcode → Settings → Accounts).
  TEAM="$(tr -d ' \n\r' < tool/apple_team.txt 2>/dev/null || true)"
  if [ -n "$TEAM" ]; then
    PBX=ios/Runner.xcodeproj/project.pbxproj
    if ! grep -q "DEVELOPMENT_TEAM = $TEAM;" "$PBX"; then
      echo "Setting Apple Team $TEAM with automatic signing"
      python3 - "$PBX" "$TEAM" <<'PY'
import re, sys
p, team = sys.argv[1], sys.argv[2]
s = open(p).read()
s = re.sub(r"\t*DEVELOPMENT_TEAM = [^;]*;\n", "", s)
s = re.sub(r"\t*CODE_SIGN_STYLE = [^;]*;\n", "", s)
s = re.sub(r"(\n(\t+)PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);)",
           lambda m: m.group(1) if "RunnerTests" in m.group(3) else
           f"\n{m.group(2)}CODE_SIGN_STYLE = Automatic;\n{m.group(2)}DEVELOPMENT_TEAM = {team};{m.group(1)}", s)
open(p, "w").write(s)
PY
    fi
  fi
  echo "Checking the Xcode project…"
  xc_check() { xcodebuild -project ios/Runner.xcodeproj -scheme Runner -configuration Release -destination 'generic/platform=iOS' -showBuildSettings >/tmp/bquee-xc.txt 2>&1; }
  if ! xc_check; then
    if grep -q "no destinations\|platform.*not installed\|iOS .* is not installed" /tmp/bquee-xc.txt; then
      step "Downloading the iOS platform for Xcode (one time, several GB)"
      xcodebuild -downloadPlatform iOS
    fi
    if ! xc_check; then
      echo "Xcode could not read the project:"; grep -v "^ " /tmp/bquee-xc.txt | tail -25
      echo "iOS build stopped (Android files are ready)."; exit 1
    fi
  fi
  echo "Xcode project OK"
  if ! command -v pod >/dev/null 2>&1; then echo "(CocoaPods not needed – the app has no plugins)"; fi
  flutter build ios --release --no-codesign 2>&1 | { grep -v -E "codesigning disabled|manually codesign" || true; }
  (cd build/ios/iphoneos && rm -f "$OUT/BQuee-unsigned.ipa" && mkdir -p Payload && cp -R Runner.app Payload/ && zip -qr "$OUT/BQuee-unsigned.ipa" Payload && rm -rf Payload)
  if [ -n "$TEAM" ]; then
    step "Signed iOS build (team $TEAM)"
    SIGNLOG="$APP_DIR/build/ios-signing-log.txt"
    if flutter build ipa --release >"$SIGNLOG" 2>&1; then
      cp build/ios/ipa/*.ipa "$OUT/BQuee.ipa" && echo "Signed BQuee.ipa ready for TestFlight / App Store"
    elif grep -q -E "no devices|No profiles for|provisioning profile" "$SIGNLOG"; then
      echo "Signed iPhone app skipped – your Apple team has no registered iPhone yet."
      echo "  To sign: connect an iPhone to this Mac once (or add its ID at developer.apple.com → Devices),"
      echo "  or use a paid Apple Developer account for App Store builds. Then build again."
      echo "  The unsigned .ipa is ready. Xcode's details: build/ios-signing-log.txt"
    else
      echo "App Store IPA needs a paid Apple Developer account – building a signed app for your own iPhone instead."
      if flutter build ios --release >>"$SIGNLOG" 2>&1; then
        echo "Signed app built. Installing on a connected iPhone (if one is plugged in and unlocked)…"
        flutter install --release || echo "No iPhone found: connect it by cable, unlock it, tap Trust, turn on Settings → Privacy & Security → Developer Mode, then run this again."
      else
        echo "Signed iPhone app could not be made – the unsigned .ipa is ready. Details: build/ios-signing-log.txt"
      fi
    fi
  else
    echo "Signed IPA skipped: add your Apple Team ID to tool/apple_team.txt"
  fi
else
  echo; echo "iOS skipped: install Xcode from the App Store, open it once, then run this script again."
fi

step "Done"
ls -lh "$OUT"
open "$OUT" 2>/dev/null || true
