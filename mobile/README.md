# BQuee mobile app (Android & iOS)

One Flutter app for **super admins**, the **BQuee team**, **service owners** and **staff**. It talks to
the same BQuee server as the web app (same API, same logins) and uses the same design: Poppins and
Lora fonts, the web's own icon set, the brand colour of each business, coloured figure cards and
voucher-style offers.

## Self-contained

- **No packages from pub.dev.** `pubspec.yaml` depends only on the Flutter SDK.
- **Fonts** are bundled in `assets/fonts` (converted from the web app's own files, SIL Open Font License).
- **Icons** are the web app's icon set drawn by our own SVG path renderer (`lib/ui/icons.dart`).
- **QR codes** – the encoder (branch QR codes and posters) and the decoder (Android scanning) are our
  own Dart code (`lib/core/qr`).
- **Phone features** are our own native code, using only the platforms' built-in APIs:
  - Android – `MainActivity.kt` and `QrCamera.kt` (Camera2, MediaStore, platform intents).
  - iOS – `AppDelegate.swift` (AVFoundation, UIKit).
  - Covers sign-in storage, opening links, sharing, the photo picker and the camera.
- **Network:** the app only talks to your BQuee server.

## What each role gets

| Role          | Screens                                                                                                                                                                                                                                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staff         | My queue (live), online/offline, scan to start/finish, add services to a token, completed today, token details                                                                                                                                                                                                                   |
| Service owner | Overview (figures, live queue, token-number reset, staff right now), tokens by date/branch + CSV export, services (+ load default services), staff (online/offline, logins), branches with QR codes and a shareable QR poster, offers (with booking discount), reviews, business profile (colour, logo, cover, contact, socials) |
| Super admin   | Businesses (figures, search, filters, create/edit/enable/disable/delete, sign-in handover), business categories and service groups, default services, team & permissions                                                                                                                                                         |
| BQuee team    | Same as super admin, limited to the permissions the super admin ticked                                                                                                                                                                                                                                                           |

Every user can edit their profile, change their password and sign out from the account menu (tap
the avatar at the top right). The app always uses the live server `https://bquee.com`. To point it at another server,
change `kDefaultServer` in `lib/core/session.dart` and rebuild.

## Build it

**Easiest (Mac):** `cd mobile && bash tool/build_mac.sh`. It installs Java 21, Flutter and the Android SDK into `~/bquee-sdk`, then builds `BQuee.apk`, `BQuee.aab` and, if Xcode is installed, the iOS app into `build/bquee-release/`.

You need **Flutter 3.50 or newer**. On a Mac, you also need **Xcode 15+** for iOS. Android needs Android Studio or the Android SDK.

```bash
cd mobile

# 1. The Android and iOS project files are included. (Running
#    flutter create --org com.bquee --project-name bquee --platforms=android,ios .
#    again is safe: it only adds missing files.)

# 2. Check and run
flutter analyze
flutter test            # QR encode/decode round trip, icon parser, formatting
flutter run             # on a connected phone or emulator
```

The app ID is `com.ibill.bquee`. To use your own app ID, change `--org` in step 1. On Android you also have to move `MainActivity.kt` and `QrCamera.kt` to the matching package folder and update their `package` line.

### Android release

```bash
flutter build appbundle --release   # for Google Play
flutter build apk --release         # for direct install
```

Create an upload key and add a `signingConfigs` block in `android/app/build.gradle(.kts)`. The steps are in Flutter's guide, "Build and release an Android app".

### iOS release

```bash
open ios/Runner.xcworkspace          # set your Team and Bundle Identifier under Signing & Capabilities
flutter build ipa --release          # then upload with Xcode Organizer or Transporter
```

The camera and photo permission messages are already in `ios/Runner/Info.plist`.

## Where things are

```
lib/
  main.dart               app entry, picks the screens for the signed-in role
  core/                   API client (dart:io), session, native bridge, formatting, QR encode/decode
  ui/                     theme (web design tokens), icons, shared widgets (buttons, cards, forms, pager)
  screens/
    login.dart, shell.dart, common.dart, profile.dart, scanner.dart, token_detail.dart
    staff/                staff app
    owner/                service owner app
    admin/                super admin + team app
android/app/src/main/     manifest, launcher icons, MainActivity.kt, QrCamera.kt
ios/Runner/               AppDelegate.swift, Info.plist, app icon
assets/fonts/             Poppins and Lora (TTF)
tool/woff_to_ttf.py       converts the web fonts to TTF (already done)
```

## Notes

- **Scanning.** Android decodes camera frames with the built-in Dart decoder. iPhones use iOS's own QR reader. You can always type the token ID instead.
- **Sharing files.** Exports (CSV, QR posters) go to Downloads/BQuee on Android 10+ and open the share sheet. On older Android the CSV is shared as text.
- **HTTPS.** The app expects your server on HTTPS (bquee.com has it). Plain HTTP servers are blocked by Android and iOS by default.
