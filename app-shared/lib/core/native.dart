// Bridge to the app's own Kotlin (Android) and Swift (iOS) code – no plugins.
// See android/app/src/main/kotlin/.../MainActivity.kt and ios/Runner/AppDelegate.swift.

import 'package:flutter/services.dart';

class Native {
  static const MethodChannel _ch = MethodChannel('bquee/native');
  static const EventChannel cameraEvents = EventChannel('bquee/camera');

  /// Small key/value storage in the app's private storage, for things that are not secret (name, role).
  /// The sign-in token is kept with getSecret/setSecret instead.
  static Future<String?> getPref(String key) async {
    try {
      return await _ch.invokeMethod<String>('getPref', {'key': key});
    } catch (_) {
      return null;
    }
  }

  static Future<void> setPref(String key, String value) async {
    try {
      await _ch.invokeMethod('setPref', {'key': key, 'value': value});
    } catch (_) {}
  }

  static Future<void> removePref(String key) async {
    try {
      await _ch.invokeMethod('removePref', {'key': key});
    } catch (_) {}
  }

  /// Secret values (the sign-in token): Android Keystore-encrypted storage / iOS Keychain (audit F-01).
  static Future<String?> getSecret(String key) async {
    try {
      return await _ch.invokeMethod<String>('getSecret', {'key': key});
    } catch (_) {
      return null;
    }
  }

  static Future<bool> setSecret(String key, String value) async {
    try {
      return await _ch.invokeMethod<bool>('setSecret', {'key': key, 'value': value}) ?? false;
    } catch (_) {
      return false;
    }
  }

  static Future<void> removeSecret(String key) async {
    try {
      await _ch.invokeMethod('removeSecret', {'key': key});
    } catch (_) {}
  }

  /// Link kinds the apps open; anything else (javascript:, file:, content:, other apps' schemes) is refused.
  static const Set<String> allowedSchemes = {
    'https',
    'http',
    'tel',
    'mailto',
    'sms',
    'whatsapp',
    'geo',
    'maps',
    'otpauth',
  };

  static bool isSafeUrl(String url) {
    final uri = Uri.tryParse(url.trim());
    return uri != null && allowedSchemes.contains(uri.scheme.toLowerCase());
  }

  /// Opens a link in the phone's browser / dialler / WhatsApp / maps (safe kinds only).
  static Future<bool> openUrl(String url) async {
    if (!isSafeUrl(url)) return false;
    try {
      return await _ch.invokeMethod<bool>('openUrl', {'url': url}) ?? false;
    } catch (_) {
      return false;
    }
  }

  static Future<void> shareText(String text, {String subject = ''}) async {
    try {
      await _ch.invokeMethod('shareText', {'text': text, 'subject': subject});
    } catch (_) {}
  }

  /// Saves a file (Downloads on Android, share sheet on iOS) and opens the share sheet.
  static Future<bool> shareFile(String name, String mime, Uint8List bytes) async {
    try {
      return await _ch.invokeMethod<bool>('shareFile', {'name': name, 'mime': mime, 'bytes': bytes}) ?? false;
    } catch (_) {
      return false;
    }
  }

  /// "Continue with Google / Apple": shows the sign-in page (iPhone: Apple's secure sheet; Android:
  /// the browser) and returns the bqueebiz://oauth… link it comes back with, or null if closed.
  static Future<String?> webAuth(String url) async {
    try {
      return await _ch.invokeMethod<String>('webAuth', {'url': url});
    } on MissingPluginException {
      return null;
    }
  }

  /// Opens the photo picker; returns a resized JPEG as a data URL, or null if cancelled.
  static Future<String?> pickImage({int maxSize = 1200}) async {
    try {
      return await _ch.invokeMethod<String>('pickImage', {'max': maxSize});
    } catch (_) {
      return null;
    }
  }

  /// Starts the rear camera. Returns {textureId, width, height, rotation} or throws.
  static Future<Map<String, dynamic>> startCamera() async {
    final r = await _ch.invokeMethod<Map>('startCamera');
    return Map<String, dynamic>.from(r ?? const {});
  }

  static Future<void> stopCamera() async {
    try {
      await _ch.invokeMethod('stopCamera');
    } catch (_) {}
  }

  /// Tells Android the last frame has been decoded, so it can send the next one.
  static Future<void> frameDone() async {
    try {
      await _ch.invokeMethod('frameDone');
    } catch (_) {}
  }

  static Future<bool> setTorch(bool on) async {
    try {
      return await _ch.invokeMethod<bool>('torch', {'on': on}) ?? false;
    } catch (_) {
      return false;
    }
  }
}
