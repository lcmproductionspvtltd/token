package com.bquee.customer

// Notifications in the phone's status bar – the app's own code, no Firebase or plugins.
//  - While the app is open, the app checks for new ones and calls show().
//  - While it is closed, Android runs NotesJob about every 15 minutes (only with internet, and
//    Android may wait longer to save battery). It asks the server "anything after #id?" – one tiny
//    request – and shows what is new. Signing out stops it.

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Base64
import java.net.HttpURLConnection
import java.net.URL

object Notes {
    private const val CHANNEL = "updates"
    private const val JOB_ID = 7301
    private const val PREFS = "bquee"

    fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** True when the app may show notifications (Android 13+ asks the person once). */
    fun allowed(ctx: Context): Boolean =
        Build.VERSION.SDK_INT < 33 ||
            ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    /** Shows one notification in the status bar. Tapping it opens the app. */
    fun show(ctx: Context, id: Int, title: String, body: String) {
        if (!allowed(ctx)) return
        val manager = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26 && manager.getNotificationChannel(CHANNEL) == null) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL, "Updates", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "Your turn, cancelled tokens and other updates"
                },
            )
        }
        val open = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val tap = PendingIntent.getActivity(
            ctx,
            id,
            open ?: Intent(),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        @Suppress("DEPRECATION")
        val builder = if (Build.VERSION.SDK_INT >= 26) android.app.Notification.Builder(ctx, CHANNEL)
        else android.app.Notification.Builder(ctx).setPriority(android.app.Notification.PRIORITY_HIGH)
        val note = builder
            .setSmallIcon(R.drawable.ic_stat_bquee)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(android.app.Notification.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(tap)
            .build()
        manager.notify(id, note)
    }

    /** Remembers where to ask and starts the background check (about every 15 minutes). */
    fun watch(ctx: Context, base: String, path: String, secret: String, after: Long) {
        prefs(ctx).edit()
            .putString("notes_base", base)
            .putString("notes_path", path)
            .putString("notes_secret", secret)
            .putString("notes_after", after.toString())
            .apply()
        val scheduler = ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler
        if (scheduler.getPendingJob(JOB_ID) != null) return
        scheduler.schedule(
            JobInfo.Builder(JOB_ID, ComponentName(ctx, NotesJob::class.java))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(15 * 60 * 1000L)
                .setPersisted(true)
                .build(),
        )
    }

    /** Signed out: no more background checks, and forget where to ask. */
    fun stop(ctx: Context) {
        (ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler).cancel(JOB_ID)
        prefs(ctx).edit().remove("notes_base").remove("notes_path").remove("notes_secret").remove("notes_after").apply()
        (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancelAll()
    }

    /** Reads the sign-in token the app saved (Keystore-encrypted). Never creates a key. */
    fun readSecret(ctx: Context, key: String): String? {
        val stored = ctx.getSharedPreferences("bquee_secure", Context.MODE_PRIVATE).getString(key, null) ?: return null
        return try {
            val ks = java.security.KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            val entry = ks.getEntry("bquee_secret_key", null) as? java.security.KeyStore.SecretKeyEntry ?: return null
            val raw = Base64.decode(stored, Base64.NO_WRAP)
            val cipher = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(
                javax.crypto.Cipher.DECRYPT_MODE,
                entry.secretKey,
                javax.crypto.spec.GCMParameterSpec(128, raw.copyOfRange(0, 12)),
            )
            String(cipher.doFinal(raw.copyOfRange(12, raw.size)), Charsets.UTF_8)
        } catch (e: Exception) {
            null
        }
    }

    /** One background check. Returns false when the sign-in has ended (stop checking). */
    fun check(ctx: Context): Boolean {
        val p = prefs(ctx)
        val base = p.getString("notes_base", null) ?: return false
        val path = p.getString("notes_path", null) ?: return false
        val token = readSecret(ctx, p.getString("notes_secret", "") ?: "") ?: return false
        val after = p.getString("notes_after", "0")?.toLongOrNull() ?: 0L
        if (!base.startsWith("https://")) return true // never send the sign-in over plain http
        val conn = URL("$base$path?after=$after").openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 15_000
            conn.readTimeout = 20_000
            conn.setRequestProperty("Authorization", "Bearer $token")
            conn.setRequestProperty("Accept", "application/json")
            if (conn.responseCode == 401) return false
            if (conn.responseCode != 200) return true
            val json = org.json.JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
            val items = json.optJSONArray("items") ?: return true
            var newest = after
            // Oldest first, at most 5 at a time.
            for (i in minOf(items.length(), 5) - 1 downTo 0) {
                val n = items.getJSONObject(i)
                val id = n.optLong("id")
                if (id <= after) continue
                show(ctx, (id % Int.MAX_VALUE).toInt(), n.optString("title"), n.optString("body"))
                if (id > newest) newest = id
            }
            for (i in 0 until items.length()) newest = maxOf(newest, items.getJSONObject(i).optLong("id"))
            p.edit().putString("notes_after", newest.toString()).apply()
            return true
        } finally {
            conn.disconnect()
        }
    }
}

/** Android runs this now and then while the app is closed. */
class NotesJob : JobService() {
    override fun onStartJob(params: JobParameters?): Boolean {
        Thread {
            val keep = try {
                Notes.check(applicationContext)
            } catch (e: Exception) {
                true // offline or the server is busy: try next time
            }
            if (!keep) Notes.stop(applicationContext)
            jobFinished(params, false)
        }.start()
        return true
    }

    override fun onStopJob(params: JobParameters?): Boolean = true
}
