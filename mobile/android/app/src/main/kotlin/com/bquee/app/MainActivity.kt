package com.bquee.app

// The app's own native code (no plugins): key/value storage, links, sharing, photo picker
// and the camera used by the token scanner.

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.ByteArrayOutputStream

class MainActivity : FlutterActivity() {
    private var events: EventChannel.EventSink? = null
    private var pendingPick: MethodChannel.Result? = null
    private var pendingPickMax = 1200
    private var pendingCamera: MethodChannel.Result? = null
    private var camera: QrCamera? = null
    private var pendingAuth: MethodChannel.Result? = null // "Continue with Google / Apple" in the browser

    companion object {
        private const val REQ_PICK = 4101
        private const val REQ_CAMERA = 4102
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val messenger = flutterEngine.dartExecutor.binaryMessenger
        MethodChannel(messenger, "bquee/native").setMethodCallHandler { call, result -> handle(call, result) }
        EventChannel(messenger, "bquee/camera").setStreamHandler(object : EventChannel.StreamHandler {
            override fun onListen(arguments: Any?, sink: EventChannel.EventSink?) {
                events = sink
            }

            override fun onCancel(arguments: Any?) {
                events = null
            }
        })
        camera = QrCamera(this, flutterEngine.renderer) { frame -> runOnUiThread { events?.success(frame) } }
    }

    private val prefs by lazy { getSharedPreferences("bquee", Context.MODE_PRIVATE) }

    /*
     * Secrets (the sign-in token) – audit F-01. Encrypted with an AES-256-GCM key that lives in the
     * Android Keystore (hardware-backed on most phones) and never leaves it; only the encrypted bytes
     * are kept in a separate private file. If the key is gone (e.g. restored to another phone) the
     * secret can't be read and the person simply signs in again.
     */
    private val secretPrefs by lazy { getSharedPreferences("bquee_secure", Context.MODE_PRIVATE) }
    private val keyAlias = "bquee_secret_key"

    private fun secretKey(): javax.crypto.SecretKey {
        val ks = java.security.KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getEntry(keyAlias, null) as? java.security.KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val gen = javax.crypto.KeyGenerator.getInstance(android.security.keystore.KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            android.security.keystore.KeyGenParameterSpec.Builder(
                keyAlias,
                android.security.keystore.KeyProperties.PURPOSE_ENCRYPT or android.security.keystore.KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return gen.generateKey()
    }

    private fun setSecret(key: String, value: String): Boolean = try {
        val cipher = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(javax.crypto.Cipher.ENCRYPT_MODE, secretKey())
        val sealed = cipher.iv + cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        secretPrefs.edit().putString(key, Base64.encodeToString(sealed, Base64.NO_WRAP)).apply()
        true
    } catch (e: Exception) {
        false
    }

    private fun getSecret(key: String): String? {
        val stored = secretPrefs.getString(key, null) ?: return null
        return try {
            val raw = Base64.decode(stored, Base64.NO_WRAP)
            val cipher = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(javax.crypto.Cipher.DECRYPT_MODE, secretKey(), javax.crypto.spec.GCMParameterSpec(128, raw.copyOfRange(0, 12)))
            String(cipher.doFinal(raw.copyOfRange(12, raw.size)), Charsets.UTF_8)
        } catch (e: Exception) {
            secretPrefs.edit().remove(key).apply() // unreadable: forget it
            null
        }
    }

    /** Only these kinds of links are opened (no javascript:, file:, content: or app-internal schemes). */
    private val allowedSchemes = setOf("https", "http", "tel", "mailto", "sms", "whatsapp", "geo", "otpauth")

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val link = intent.data
        if (link != null && link.scheme == "bqueebiz" && link.host == "oauth") {
            pendingAuth?.success(link.toString())
            pendingAuth = null
        }
    }

    override fun onResume() {
        super.onResume()
        // Back in the app without the sign-in link (browser closed): tell the app it was cancelled.
        val waiting = pendingAuth ?: return
        window.decorView.postDelayed({
            if (pendingAuth === waiting) {
                waiting.success(null)
                pendingAuth = null
            }
        }, 1500)
    }

    private fun handle(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "getPref" -> result.success(prefs.getString(call.argument<String>("key") ?: "", null))
            "setPref" -> {
                prefs.edit().putString(call.argument<String>("key") ?: "", call.argument<String>("value") ?: "").apply()
                result.success(true)
            }
            "removePref" -> {
                prefs.edit().remove(call.argument<String>("key") ?: "").apply()
                result.success(true)
            }
            "getSecret" -> result.success(getSecret(call.argument<String>("key") ?: ""))
            "setSecret" -> result.success(setSecret(call.argument<String>("key") ?: "", call.argument<String>("value") ?: ""))
            "removeSecret" -> {
                secretPrefs.edit().remove(call.argument<String>("key") ?: "").apply()
                result.success(true)
            }
            "openUrl" -> result.success(openUrl(call.argument<String>("url") ?: ""))
            "timeZone" -> result.success(java.util.TimeZone.getDefault().id) // e.g. "Asia/Dubai"
            "webAuth" -> {
                // Opens the sign-in page in the browser; answered with the bqueebiz://oauth link it comes
                // back with (onNewIntent), or null when the person returns without finishing.
                pendingAuth?.success(null)
                pendingAuth = result
                val url = call.argument<String>("url") ?: ""
                if (!url.startsWith("https://") && !url.startsWith("http://")) {
                    pendingAuth = null
                    result.success(null)
                } else {
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                    } catch (e: ActivityNotFoundException) {
                        pendingAuth = null
                        result.error("no_browser", "No web browser is installed on this phone.", null)
                    }
                }
            }
            "shareText" -> {
                val send = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, call.argument<String>("text") ?: "")
                    val subject = call.argument<String>("subject") ?: ""
                    if (subject.isNotEmpty()) putExtra(Intent.EXTRA_SUBJECT, subject)
                }
                try {
                    startActivity(Intent.createChooser(send, null))
                    result.success(true)
                } catch (e: Exception) {
                    result.success(false)
                }
            }
            "shareFile" -> result.success(
                shareFile(
                    call.argument<String>("name") ?: "file",
                    call.argument<String>("mime") ?: "application/octet-stream",
                    call.argument<ByteArray>("bytes") ?: ByteArray(0),
                ),
            )
            "pickImage" -> {
                if (pendingPick != null) {
                    result.success(null)
                    return
                }
                pendingPick = result
                pendingPickMax = call.argument<Int>("max") ?: 1200
                val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                    type = "image/*"
                    addCategory(Intent.CATEGORY_OPENABLE)
                }
                try {
                    @Suppress("DEPRECATION")
                    startActivityForResult(Intent.createChooser(intent, null), REQ_PICK)
                } catch (e: Exception) {
                    pendingPick = null
                    result.success(null)
                }
            }
            "startCamera" -> {
                // Runtime permission exists from Android 6; older versions grant it at install.
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
                    checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
                ) {
                    startCamera(result)
                } else {
                    pendingCamera = result
                    requestPermissions(arrayOf(Manifest.permission.CAMERA), REQ_CAMERA)
                }
            }
            "stopCamera" -> {
                camera?.stop()
                result.success(true)
            }
            "frameDone" -> {
                camera?.frameDone()
                result.success(true)
            }
            "torch" -> result.success(camera?.setTorch(call.argument<Boolean>("on") ?: false) ?: false)
            else -> result.notImplemented()
        }
    }

    private fun startCamera(result: MethodChannel.Result) {
        val cam = camera
        if (cam == null) {
            result.error("unavailable", "Camera not ready", null)
            return
        }
        cam.start(
            onReady = { info -> runOnUiThread { result.success(info) } },
            fail = { message: String -> runOnUiThread { result.error("camera", message, null) } },
        )
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQ_CAMERA) return
        val pending = pendingCamera ?: return
        pendingCamera = null
        if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            startCamera(pending)
        } else {
            pending.error("denied", "Camera permission denied", null)
        }
    }

    private fun openUrl(url: String): Boolean {
        if (url.isEmpty()) return false
        val scheme = Uri.parse(url).scheme?.lowercase() ?: return false
        if (scheme !in allowedSchemes) return false
        return try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            true
        } catch (e: ActivityNotFoundException) {
            false
        } catch (e: Exception) {
            false
        }
    }

    /** Saves into Downloads/BQuee and opens the share sheet for it (Android 10+). */
    private fun shareFile(name: String, mime: String, bytes: ByteArray): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
        return try {
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                put(MediaStore.MediaColumns.MIME_TYPE, mime)
                put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/BQuee")
            }
            val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return false
            contentResolver.openOutputStream(uri)?.use { it.write(bytes) } ?: return false
            val send = Intent(Intent.ACTION_SEND).apply {
                type = mime
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(Intent.createChooser(send, name))
            true
        } catch (e: Exception) {
            false
        }
    }

    @Deprecated("Uses the platform activity result API on purpose (no AndroidX).")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_PICK) return
        val result = pendingPick ?: return
        pendingPick = null
        val uri = data?.data
        if (resultCode != RESULT_OK || uri == null) {
            result.success(null)
            return
        }
        Thread {
            val out = try {
                encodePicked(uri, pendingPickMax)
            } catch (e: Exception) {
                null
            }
            runOnUiThread { result.success(out) }
        }.start()
    }

    /** Reads the picked photo, fixes its rotation, shrinks it and returns a JPEG data URL. */
    private fun encodePicked(uri: Uri, max: Int): String? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        var sample = 1
        while (bounds.outWidth / (sample * 2) >= max && bounds.outHeight / (sample * 2) >= max) sample *= 2
        val opts = BitmapFactory.Options().apply { inSampleSize = sample }
        var bmp = contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) } ?: return null

        var degrees = 0
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            try {
                contentResolver.openInputStream(uri)?.use {
                    val exif = ExifInterface(it)
                    degrees = when (exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                        ExifInterface.ORIENTATION_ROTATE_90 -> 90
                        ExifInterface.ORIENTATION_ROTATE_180 -> 180
                        ExifInterface.ORIENTATION_ROTATE_270 -> 270
                        else -> 0
                    }
                }
            } catch (e: Exception) {
                degrees = 0
            }
        }
        val scale = minOf(1f, max.toFloat() / maxOf(bmp.width, bmp.height).toFloat())
        if (scale < 1f || degrees != 0) {
            val m = Matrix()
            if (scale < 1f) m.postScale(scale, scale)
            if (degrees != 0) m.postRotate(degrees.toFloat())
            val next = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
            if (next != bmp) bmp.recycle()
            bmp = next
        }
        val out = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.JPEG, 84, out)
        bmp.recycle()
        return "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    }

    override fun onDestroy() {
        camera?.stop()
        super.onDestroy()
    }
}
