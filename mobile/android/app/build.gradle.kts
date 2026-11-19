plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.bquee.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.bquee.app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    // Store signing: the release workflow (.github/workflows/release.yml) passes the upload key from GitHub
    // secrets in these environment variables. Without them (Mac builds, CI checks) the test key is used, as before.
    val uploadKeystore = System.getenv("BQUEE_KEYSTORE_FILE")
    signingConfigs {
        if (!uploadKeystore.isNullOrEmpty()) {
            create("upload") {
                storeFile = file(uploadKeystore)
                storePassword = System.getenv("BQUEE_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("BQUEE_KEY_ALIAS")
                keyPassword = System.getenv("BQUEE_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            signingConfig =
                if (!uploadKeystore.isNullOrEmpty()) signingConfigs.getByName("upload")
                else signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
