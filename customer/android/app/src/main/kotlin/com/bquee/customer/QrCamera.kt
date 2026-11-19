package com.bquee.customer

// Rear camera for the token scanner, using the platform Camera2 API (no CameraX / ML Kit).
// The preview goes to a Flutter texture; a grayscale centre crop of each frame is sent to
// Dart, where our own QR decoder reads it.

import android.app.Activity
import android.content.Context
import android.graphics.ImageFormat
import android.graphics.SurfaceTexture
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureRequest
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.util.Size
import io.flutter.view.TextureRegistry

class QrCamera(
    private val activity: Activity,
    private val textures: TextureRegistry,
    private val onFrame: (Map<String, Any>) -> Unit,
) {
    private var thread: HandlerThread? = null
    private var handler: Handler? = null
    private var device: CameraDevice? = null
    private var session: CameraCaptureSession? = null
    private var reader: ImageReader? = null
    private var producer: TextureRegistry.SurfaceProducer? = null
    private var request: CaptureRequest.Builder? = null
    private var hasFlash = false

    @Volatile private var sending = false
    @Volatile private var running = false
    @Volatile private var lastFrameAt = 0L

    fun start(onReady: (Map<String, Any>) -> Unit, fail: (String) -> Unit) {
        stop()
        var answered = false
        val ready: (Map<String, Any>) -> Unit = { info ->
            if (!answered) {
                answered = true
                onReady(info)
            }
        }
        val failed: (String) -> Unit = { message ->
            if (!answered) {
                answered = true
                fail(message)
            }
        }

        val manager = activity.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        val ids = try {
            manager.cameraIdList.toList()
        } catch (e: Exception) {
            emptyList()
        }
        val id = ids.firstOrNull {
            manager.getCameraCharacteristics(it).get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
        } ?: ids.firstOrNull()
        if (id == null) {
            failed("No camera on this device")
            return
        }
        val chars = manager.getCameraCharacteristics(id)
        val map = chars.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
        if (map == null) {
            failed("Camera has no output sizes")
            return
        }
        hasFlash = chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
        val sensor = chars.get(CameraCharacteristics.SENSOR_ORIENTATION) ?: 90
        val previewSize = pick(map.getOutputSizes(SurfaceTexture::class.java), 1280, 720)
        val analysisSize = pick(map.getOutputSizes(ImageFormat.YUV_420_888), 1280, 720)

        val t = HandlerThread("bquee-camera")
        t.start()
        thread = t
        val h = Handler(t.looper)
        handler = h

        val prod = textures.createSurfaceProducer()
        prod.setSize(previewSize.width, previewSize.height)
        producer = prod
        val handles = try {
            prod.handlesCropAndRotation()
        } catch (e: Throwable) {
            false
        }

        val rd = ImageReader.newInstance(analysisSize.width, analysisSize.height, ImageFormat.YUV_420_888, 2)
        rd.setOnImageAvailableListener({ r -> onImage(r) }, h)
        reader = rd
        running = true
        sending = false

        try {
            manager.openCamera(id, object : CameraDevice.StateCallback() {
                override fun onOpened(cam: CameraDevice) {
                    device = cam
                    try {
                        val previewSurface = prod.surface
                        val surfaces = listOf(previewSurface, rd.surface)
                        val req = cam.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW)
                        req.addTarget(previewSurface)
                        req.addTarget(rd.surface)
                        req.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE)
                        request = req
                        @Suppress("DEPRECATION")
                        cam.createCaptureSession(surfaces, object : CameraCaptureSession.StateCallback() {
                            override fun onConfigured(s: CameraCaptureSession) {
                                session = s
                                try {
                                    s.setRepeatingRequest(req.build(), null, h)
                                } catch (e: Exception) {
                                    failed(e.message ?: "Camera could not start")
                                    return
                                }
                                // When the texture backend applies the rotation itself, the
                                // picture arrives upright (portrait), so width/height swap.
                                val swap = handles && (sensor == 90 || sensor == 270)
                                ready(
                                    mapOf(
                                        "textureId" to prod.id(),
                                        "width" to (if (swap) previewSize.height else previewSize.width),
                                        "height" to (if (swap) previewSize.width else previewSize.height),
                                        "rotation" to (if (handles) 0 else sensor),
                                    ),
                                )
                            }

                            override fun onConfigureFailed(s: CameraCaptureSession) {
                                failed("Camera setup failed")
                            }
                        }, h)
                    } catch (e: Exception) {
                        failed(e.message ?: "Camera could not start")
                    }
                }

                override fun onDisconnected(cam: CameraDevice) {
                    cam.close()
                    device = null
                }

                override fun onError(cam: CameraDevice, error: Int) {
                    cam.close()
                    device = null
                    failed("Camera error $error")
                }
            }, h)
        } catch (e: SecurityException) {
            failed("denied")
        } catch (e: Exception) {
            failed(e.message ?: "Camera could not start")
        }
    }

    /** Largest size not bigger than the target area, preferring the target's aspect ratio. */
    private fun pick(sizes: Array<Size>?, w: Int, h: Int): Size {
        if (sizes == null || sizes.isEmpty()) return Size(w, h)
        val target = w.toDouble() / h
        val fitting = sizes.filter { it.width * it.height <= w * h }
        val pool = if (fitting.isEmpty()) sizes.toList() else fitting
        return pool.maxByOrNull { s ->
            val aspectPenalty = Math.abs(s.width.toDouble() / s.height - target)
            s.width.toDouble() * s.height - aspectPenalty * 400000.0
        } ?: sizes[0]
    }

    private fun onImage(r: ImageReader) {
        val img = try {
            r.acquireLatestImage()
        } catch (e: Exception) {
            null
        } ?: return
        try {
            if (!running || sending) return
            val now = SystemClock.elapsedRealtime()
            if (now - lastFrameAt < 120) return
            val plane = img.planes[0]
            val w = img.width
            val hh = img.height
            val side = minOf(w, hh)
            val step = maxOf(1, (side + 599) / 600)
            val out = side / step
            val x0 = (w - side) / 2
            val y0 = (hh - side) / 2
            val buf = plane.buffer
            val rowStride = plane.rowStride
            val pixStride = plane.pixelStride
            val bytes = ByteArray(out * out)
            var k = 0
            for (y in 0 until out) {
                val row = (y0 + y * step) * rowStride
                for (x in 0 until out) {
                    bytes[k++] = buf.get(row + (x0 + x * step) * pixStride)
                }
            }
            sending = true
            lastFrameAt = now
            onFrame(mapOf("type" to "frame", "w" to out, "h" to out, "y" to bytes))
        } catch (e: Exception) {
            sending = false
        } finally {
            img.close()
        }
    }

    fun frameDone() {
        sending = false
    }

    fun setTorch(on: Boolean): Boolean {
        val s = session ?: return false
        val req = request ?: return false
        if (!hasFlash) return false
        return try {
            req.set(CaptureRequest.FLASH_MODE, if (on) CaptureRequest.FLASH_MODE_TORCH else CaptureRequest.FLASH_MODE_OFF)
            s.setRepeatingRequest(req.build(), null, handler)
            true
        } catch (e: Exception) {
            false
        }
    }

    fun stop() {
        running = false
        sending = false
        try {
            session?.close()
        } catch (e: Exception) {
        }
        session = null
        try {
            device?.close()
        } catch (e: Exception) {
        }
        device = null
        try {
            reader?.close()
        } catch (e: Exception) {
        }
        reader = null
        try {
            producer?.release()
        } catch (e: Exception) {
        }
        producer = null
        request = null
        thread?.quitSafely()
        thread = null
        handler = null
    }
}
