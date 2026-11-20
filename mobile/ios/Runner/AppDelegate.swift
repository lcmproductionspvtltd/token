// The app's own native code (no plugins): key/value storage, links, sharing, photo picker and
// the camera for the token scanner. All in this one file so no Xcode project changes are needed.

import AVFoundation
import AuthenticationServices
import Flutter
import Security
import UIKit

// Uses Apple's scene-based app life cycle (UIScene), required for apps built with the iOS 27 SDK.
// The window belongs to the scene (SceneDelegate / Info.plist), so the native channels are set up
// when Flutter's engine starts – not at app launch.
@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  private var native: BQueeNative?  // kept so its channel handlers stay alive

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "BQueeNative") {
      native = BQueeNative(registrar: registrar)
    }
  }
}

final class BQueeNative: NSObject, FlutterStreamHandler, UIImagePickerControllerDelegate,
  UINavigationControllerDelegate, ASWebAuthenticationPresentationContextProviding
{
  private var authSession: ASWebAuthenticationSession?  // "Continue with Google / Apple"

  private let registrar: FlutterPluginRegistrar
  private var events: FlutterEventSink?
  private var pickResult: FlutterResult?
  private var pickMax: CGFloat = 1200
  private var camera: QrCameraIOS?

  init(registrar: FlutterPluginRegistrar) {
    self.registrar = registrar
    super.init()
    let channel = FlutterMethodChannel(name: "bquee/native", binaryMessenger: registrar.messenger())
    channel.setMethodCallHandler { [weak self] call, result in self?.handle(call, result) }
    let ev = FlutterEventChannel(name: "bquee/camera", binaryMessenger: registrar.messenger())
    ev.setStreamHandler(self)
  }

  func onListen(withArguments arguments: Any?, eventSink: @escaping FlutterEventSink) -> FlutterError? {
    events = eventSink
    return nil
  }

  func onCancel(withArguments arguments: Any?) -> FlutterError? {
    events = nil
    return nil
  }

  private var rootController: UIViewController? {
    // Under UIScene the window belongs to the active scene (the app delegate has none).
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let windows = scenes.flatMap { $0.windows }
    let window = windows.first { $0.isKeyWindow } ?? windows.first
    var top = window?.rootViewController
    while let presented = top?.presentedViewController { top = presented }
    return top
  }

  // MARK: secrets – audit F-01
  // The sign-in token lives in the iOS Keychain (encrypted by the system, only on this device, not in
  // backups). Everything else small stays in UserDefaults.
  private let keychainService = Bundle.main.bundleIdentifier ?? "bquee"

  private func keychainQuery(_ key: String) -> [String: Any] {
    [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: keychainService, kSecAttrAccount as String: key]
  }

  private func setSecret(_ key: String, _ value: String) -> Bool {
    let query = keychainQuery(key)
    SecItemDelete(query as CFDictionary)
    var add = query
    add[kSecValueData as String] = Data(value.utf8)
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
  }

  private func getSecret(_ key: String) -> String? {
    var query = keychainQuery(key)
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var out: AnyObject?
    guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }

  private func removeSecret(_ key: String) {
    SecItemDelete(keychainQuery(key) as CFDictionary)
  }

  /// Keychain items survive deleting the app; after a fresh install the old sign-in must not come back.
  private func forgetSecretsAfterReinstall() {
    let flag = "bquee.installed"
    if UserDefaults.standard.bool(forKey: flag) { return }
    SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: keychainService] as CFDictionary)
    UserDefaults.standard.set(true, forKey: flag)
  }

  /// Only these kinds of links are opened (no javascript:, file: or other app schemes).
  private let allowedSchemes: Set<String> = ["https", "http", "tel", "mailto", "sms", "whatsapp", "maps", "otpauth"]

  private func handle(_ call: FlutterMethodCall, _ result: @escaping FlutterResult) {
    let args = call.arguments as? [String: Any] ?? [:]
    switch call.method {
    case "getPref":
      result(UserDefaults.standard.string(forKey: "bquee." + (args["key"] as? String ?? "")))
    case "setPref":
      UserDefaults.standard.set(args["value"] as? String ?? "", forKey: "bquee." + (args["key"] as? String ?? ""))
      result(true)
    case "removePref":
      UserDefaults.standard.removeObject(forKey: "bquee." + (args["key"] as? String ?? ""))
      result(true)
    case "getSecret":
      forgetSecretsAfterReinstall()
      result(getSecret(args["key"] as? String ?? ""))
    case "setSecret":
      forgetSecretsAfterReinstall()
      result(setSecret(args["key"] as? String ?? "", args["value"] as? String ?? ""))
    case "removeSecret":
      removeSecret(args["key"] as? String ?? "")
      result(true)
    case "openUrl":
      guard let s = args["url"] as? String, let url = URL(string: s),
            let scheme = url.scheme?.lowercased(), allowedSchemes.contains(scheme) else {
        result(false)
        return
      }
      UIApplication.shared.open(url, options: [:]) { ok in result(ok) }
    case "webAuth":
      // Apple's secure sign-in sheet: answers with the bqueebiz://oauth link the sign-in comes back
      // with, or nil when the person closes it.
      guard let s = args["url"] as? String, let url = URL(string: s),
            let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http" else {
        result(nil)
        return
      }
      let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "bqueebiz") { [weak self] back, _ in
        result(back?.absoluteString)
        self?.authSession = nil
      }
      session.presentationContextProvider = self
      authSession = session
      if !session.start() {
        authSession = nil
        result(nil)
      }
    case "shareText":
      share(items: [args["text"] as? String ?? ""], result: result)
    case "shareFile":
      let name = args["name"] as? String ?? "file"
      guard let data = (args["bytes"] as? FlutterStandardTypedData)?.data else {
        result(false)
        return
      }
      let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
      do {
        try data.write(to: url, options: .atomic)
        share(items: [url], result: result)
      } catch {
        result(false)
      }
    case "pickImage":
      pickMax = CGFloat(args["max"] as? Int ?? 1200)
      pickImage(result)
    case "startCamera":
      startCamera(result)
    case "stopCamera":
      camera?.stop()
      camera = nil
      result(true)
    case "frameDone":
      result(true)
    case "torch":
      result(camera?.setTorch(args["on"] as? Bool ?? false) ?? false)
    default:
      result(FlutterMethodNotImplemented)
    }
  }

  func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    return scenes.compactMap { $0.keyWindow }.first ?? scenes.first?.windows.first ?? ASPresentationAnchor()
  }

  private func share(items: [Any], result: @escaping FlutterResult) {
    guard let root = rootController else {
      result(false)
      return
    }
    let vc = UIActivityViewController(activityItems: items, applicationActivities: nil)
    if let pop = vc.popoverPresentationController {
      pop.sourceView = root.view
      pop.sourceRect = CGRect(x: root.view.bounds.midX, y: root.view.bounds.midY, width: 1, height: 1)
      pop.permittedArrowDirections = []
    }
    root.present(vc, animated: true)
    result(true)
  }

  // MARK: photo picker

  private func pickImage(_ result: @escaping FlutterResult) {
    guard pickResult == nil, let root = rootController else {
      result(nil)
      return
    }
    pickResult = result
    let picker = UIImagePickerController()
    picker.sourceType = .photoLibrary
    picker.delegate = self
    root.present(picker, animated: true)
  }

  func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
    picker.dismiss(animated: true)
    pickResult?(nil)
    pickResult = nil
  }

  func imagePickerController(
    _ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
  ) {
    picker.dismiss(animated: true)
    let result = pickResult
    pickResult = nil
    guard let image = info[.originalImage] as? UIImage else {
      result?(nil)
      return
    }
    let maxSide = pickMax
    DispatchQueue.global(qos: .userInitiated).async {
      let scale = min(1, maxSide / max(image.size.width, image.size.height))
      let size = CGSize(width: floor(image.size.width * scale), height: floor(image.size.height * scale))
      let format = UIGraphicsImageRendererFormat()
      format.scale = 1
      // Drawing also applies the photo's orientation.
      let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in
        image.draw(in: CGRect(origin: .zero, size: size))
      }
      let out = resized.jpegData(compressionQuality: 0.84).map { "data:image/jpeg;base64," + $0.base64EncodedString() }
      DispatchQueue.main.async { result?(out) }
    }
  }

  // MARK: camera

  private func startCamera(_ result: @escaping FlutterResult) {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
      openCamera(result)
    case .notDetermined:
      AVCaptureDevice.requestAccess(for: .video) { granted in
        DispatchQueue.main.async {
          if granted {
            self.openCamera(result)
          } else {
            result(FlutterError(code: "denied", message: "Camera permission denied", details: nil))
          }
        }
      }
    default:
      result(FlutterError(code: "denied", message: "Camera permission denied", details: nil))
    }
  }

  private func openCamera(_ result: @escaping FlutterResult) {
    camera?.stop()
    let cam = QrCameraIOS(textures: registrar.textures()) { [weak self] code in
      self?.events?(["type": "code", "text": code])
    }
    camera = cam
    cam.start { info, error in
      DispatchQueue.main.async {
        if let info = info {
          result(info)
        } else {
          result(FlutterError(code: "camera", message: error ?? "Camera could not start", details: nil))
        }
      }
    }
  }
}

/// Rear camera: frames go to a Flutter texture; QR codes are found by AVFoundation itself.
final class QrCameraIOS: NSObject, FlutterTexture, AVCaptureVideoDataOutputSampleBufferDelegate,
  AVCaptureMetadataOutputObjectsDelegate
{
  private let textures: FlutterTextureRegistry
  private let onCode: (String) -> Void
  private let session = AVCaptureSession()
  private let queue = DispatchQueue(label: "bquee.camera")
  private var device: AVCaptureDevice?
  private var textureId: Int64 = 0
  private var latest: CVPixelBuffer?
  private let lock = NSLock()
  private var lastCode = ""
  private var lastCodeAt = Date.distantPast

  init(textures: FlutterTextureRegistry, onCode: @escaping (String) -> Void) {
    self.textures = textures
    self.onCode = onCode
    super.init()
  }

  func start(_ done: @escaping ([String: Any]?, String?) -> Void) {
    queue.async {
      guard let dev = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
        let input = try? AVCaptureDeviceInput(device: dev)
      else {
        done(nil, "No camera on this device")
        return
      }
      self.device = dev
      self.session.beginConfiguration()
      self.session.sessionPreset = .hd1280x720
      if self.session.canAddInput(input) { self.session.addInput(input) }

      let video = AVCaptureVideoDataOutput()
      video.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
      video.alwaysDiscardsLateVideoFrames = true
      video.setSampleBufferDelegate(self, queue: self.queue)
      if self.session.canAddOutput(video) { self.session.addOutput(video) }
      if let conn = video.connection(with: .video), conn.isVideoOrientationSupported {
        conn.videoOrientation = .portrait
      }

      let meta = AVCaptureMetadataOutput()
      if self.session.canAddOutput(meta) {
        self.session.addOutput(meta)
        meta.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)
        if meta.availableMetadataObjectTypes.contains(.qr) { meta.metadataObjectTypes = [.qr] }
      }
      self.session.commitConfiguration()

      if dev.isFocusModeSupported(.continuousAutoFocus) {
        try? dev.lockForConfiguration()
        dev.focusMode = .continuousAutoFocus
        dev.unlockForConfiguration()
      }

      self.textureId = self.textures.register(self)
      self.session.startRunning()
      // Portrait buffers: 720 wide × 1280 high.
      done(["textureId": self.textureId, "width": 720, "height": 1280, "rotation": 0], nil)
    }
  }

  func copyPixelBuffer() -> Unmanaged<CVPixelBuffer>? {
    lock.lock()
    defer { lock.unlock() }
    guard let buf = latest else { return nil }
    return Unmanaged.passRetained(buf)
  }

  func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
    guard let buf = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    lock.lock()
    latest = buf
    lock.unlock()
    textures.textureFrameAvailable(textureId)
  }

  func metadataOutput(
    _ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection
  ) {
    guard let obj = metadataObjects.first as? AVMetadataMachineReadableCodeObject, let text = obj.stringValue else { return }
    if text == lastCode && Date().timeIntervalSince(lastCodeAt) < 2 { return }
    lastCode = text
    lastCodeAt = Date()
    onCode(text)
  }

  func setTorch(_ on: Bool) -> Bool {
    guard let dev = device, dev.hasTorch else { return false }
    do {
      try dev.lockForConfiguration()
      dev.torchMode = on ? .on : .off
      dev.unlockForConfiguration()
      return true
    } catch {
      return false
    }
  }

  func stop() {
    let id = textureId
    queue.async {
      if self.session.isRunning { self.session.stopRunning() }
    }
    if id != 0 { textures.unregisterTexture(id) }
    textureId = 0
  }
}
