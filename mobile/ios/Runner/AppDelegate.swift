// The app's own native code (no plugins): key/value storage, links, sharing, photo picker and
// the camera for the token scanner. All in this one file so no Xcode project changes are needed.

import AVFoundation
import BackgroundTasks
import AuthenticationServices
import Flutter
import Security
import UIKit
import UserNotifications

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
    BQueeNotes.shared.register()  // notifications and the background check
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
    case "notify":
      BQueeNotes.shared.show(
        id: (args["id"] as? NSNumber)?.intValue ?? 1, title: args["title"] as? String ?? "", body: args["body"] as? String ?? "")
      result(true)
    case "notesAsk":
      BQueeNotes.shared.ask { ok in result(ok) }
    case "notesWatch":
      BQueeNotes.shared.watch(
        base: args["base"] as? String ?? "", path: args["path"] as? String ?? "",
        secret: args["secret"] as? String ?? "", after: args["after"] as? String ?? "0")
      result(true)
    case "notesSeen":
      BQueeNotes.shared.seen(args["after"] as? String ?? "0")
      result(true)
    case "notesStop":
      BQueeNotes.shared.stop()
      result(true)
    case "openUrl":
      guard let s = args["url"] as? String, let url = URL(string: s),
            let scheme = url.scheme?.lowercased(), allowedSchemes.contains(scheme) else {
        result(false)
        return
      }
      UIApplication.shared.open(url, options: [:]) { ok in result(ok) }
    case "timeZone":
      result(TimeZone.current.identifier)  // e.g. "Asia/Dubai"
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

// MARK: notifications in the status bar – the app's own code, no Firebase or plugins.
// While the app is open it checks for new ones and calls show(). While it is closed, iOS wakes it
// now and then (Background App Refresh – iOS decides how often) to ask the server "anything after
// #id?" with one tiny request, and shows what is new. Signing out stops it.
final class BQueeNotes: NSObject, UNUserNotificationCenterDelegate {
  static let shared = BQueeNotes()
  static let taskId = "com.bquee.notes"  // also listed in Info.plist (BGTaskSchedulerPermittedIdentifiers)
  private let defaults = UserDefaults.standard
  private func pref(_ key: String) -> String? { defaults.string(forKey: "bquee." + key) }
  private func setPref(_ key: String, _ value: String?) {
    if let value = value { defaults.set(value, forKey: "bquee." + key) } else { defaults.removeObject(forKey: "bquee." + key) }
  }

  /// Called at launch (iOS only accepts the background task before launch ends).
  func register() {
    UNUserNotificationCenter.current().delegate = self
    BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.taskId, using: nil) { task in
      guard let refresh = task as? BGAppRefreshTask else {
        task.setTaskCompleted(success: false)
        return
      }
      self.run(refresh)
    }
  }

  /// Show notifications even while the app is open.
  func userNotificationCenter(
    _ center: UNUserNotificationCenter, willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .list, .sound])
  }

  func ask(_ done: @escaping (Bool) -> Void) {
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { ok, _ in
      DispatchQueue.main.async { done(ok) }
    }
  }

  func show(id: Int, title: String, body: String) {
    let content = UNMutableNotificationContent()
    content.title = title
    content.body = body
    content.sound = .default
    UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "bq-\(id)", content: content, trigger: nil))
  }

  func watch(base: String, path: String, secret: String, after: String) {
    setPref("notes_base", base)
    setPref("notes_path", path)
    setPref("notes_secret", secret)
    if Int64(pref("notes_after") ?? "0") ?? 0 < Int64(after) ?? 0 { setPref("notes_after", after) }
    schedule()
  }

  func seen(_ after: String) {
    if Int64(pref("notes_after") ?? "0") ?? 0 < Int64(after) ?? 0 { setPref("notes_after", after) }
  }

  func stop() {
    BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.taskId)
    for k in ["notes_base", "notes_path", "notes_secret", "notes_after"] { setPref(k, nil) }
    UNUserNotificationCenter.current().removeAllDeliveredNotifications()
  }

  private func schedule() {
    let request = BGAppRefreshTaskRequest(identifier: Self.taskId)
    request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
    try? BGTaskScheduler.shared.submit(request)
  }

  private func run(_ task: BGAppRefreshTask) {
    schedule()  // ask for the next one
    let job = check { keep in
      if !keep { self.stop() }
      task.setTaskCompleted(success: true)
    }
    task.expirationHandler = { job?.cancel() }
    if job == nil { task.setTaskCompleted(success: true) }
  }

  /// The sign-in token the app keeps in the Keychain.
  private func readSecret(_ key: String) -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: Bundle.main.bundleIdentifier ?? "bquee",
      kSecAttrAccount as String: key,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var out: AnyObject?
    guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }

  /// One check: "anything after #id?". Calls done(false) when the sign-in has ended.
  private func check(_ done: @escaping (Bool) -> Void) -> URLSessionDataTask? {
    guard let base = pref("notes_base"), base.hasPrefix("https://"), let path = pref("notes_path"),
      let token = readSecret(pref("notes_secret") ?? ""),
      let url = URL(string: base + path + "?after=" + (pref("notes_after") ?? "0"))
    else { return nil }
    let after = Int64(pref("notes_after") ?? "0") ?? 0
    var request = URLRequest(url: url, timeoutInterval: 20)
    request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    let job = URLSession.shared.dataTask(with: request) { data, response, _ in
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      if status == 401 { return done(false) }
      guard status == 200, let data = data,
        let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        let items = json["items"] as? [[String: Any]]
      else { return done(true) }
      var newest = after
      for n in items.prefix(5).reversed() {
        let id = (n["id"] as? NSNumber)?.int64Value ?? 0
        if id <= after { continue }
        self.show(id: Int(id % Int64(Int32.max)), title: n["title"] as? String ?? "", body: n["body"] as? String ?? "")
      }
      for n in items { newest = max(newest, (n["id"] as? NSNumber)?.int64Value ?? 0) }
      self.setPref("notes_after", String(newest))
      done(true)
    }
    job.resume()
    return job
  }
}
