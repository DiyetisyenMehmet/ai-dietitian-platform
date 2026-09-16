plugins {
    id("com.android.application")
}

fun buildConfigString(value: String): String = "\"" + value
    .replace("\\", "\\\\")
    .replace("\"", "\\\"") + "\""

val stagingWebBaseUrl = providers.gradleProperty("DIEWISH_WEB_BASE_URL")
    .orElse("https://staging.invalid")
    .get()
val productionWebBaseUrl = providers.gradleProperty("DIEWISH_PRODUCTION_WEB_BASE_URL")
    .orElse("https://diewish-frontend-730419163638.europe-west1.run.app")
    .get()

// Firebase client configuration is intentionally build-type scoped. Debug APKs
// may receive only staging values; release builds require separately named
// production properties and can never inherit staging Firebase identifiers.
val stagingFirebaseProjectId = providers.gradleProperty("DIEWISH_FIREBASE_PROJECT_ID").orElse("").get()
val stagingFirebaseAppId = providers.gradleProperty("DIEWISH_FIREBASE_APP_ID").orElse("").get()
val stagingFirebaseApiKey = providers.gradleProperty("DIEWISH_FIREBASE_API_KEY").orElse("").get()
val stagingFirebaseSenderId = providers.gradleProperty("DIEWISH_FIREBASE_SENDER_ID").orElse("").get()
val productionFirebaseProjectId = providers.gradleProperty("DIEWISH_PRODUCTION_FIREBASE_PROJECT_ID").orElse("").get()
val productionFirebaseAppId = providers.gradleProperty("DIEWISH_PRODUCTION_FIREBASE_APP_ID").orElse("").get()
val productionFirebaseApiKey = providers.gradleProperty("DIEWISH_PRODUCTION_FIREBASE_API_KEY").orElse("").get()
val productionFirebaseSenderId = providers.gradleProperty("DIEWISH_PRODUCTION_FIREBASE_SENDER_ID").orElse("").get()
val buildRevision = providers.environmentVariable("GITHUB_SHA")
    .orElse("local")
    .get()
    .take(7)

android {
    namespace = "com.diewish.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.diewish.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 2
        versionName = "0.1.1"

        buildConfigField("String", "BUILD_REVISION", buildConfigString(buildRevision))
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        debug {
            versionNameSuffix = "-dev.${buildRevision}"
            // Debug APKs must never silently target production. The staging
            // deployment workflow supplies DIEWISH_WEB_BASE_URL explicitly.
            buildConfigField("String", "WEB_BASE_URL", buildConfigString(stagingWebBaseUrl))
            buildConfigField("String", "APP_ENVIRONMENT", "\"staging\"")
            buildConfigField("String", "FIREBASE_PROJECT_ID", buildConfigString(stagingFirebaseProjectId))
            buildConfigField("String", "FIREBASE_APP_ID", buildConfigString(stagingFirebaseAppId))
            buildConfigField("String", "FIREBASE_API_KEY", buildConfigString(stagingFirebaseApiKey))
            buildConfigField("String", "FIREBASE_SENDER_ID", buildConfigString(stagingFirebaseSenderId))
        }
        release {
            isMinifyEnabled = true
            buildConfigField("String", "WEB_BASE_URL", buildConfigString(productionWebBaseUrl))
            buildConfigField("String", "APP_ENVIRONMENT", "\"production\"")
            buildConfigField("String", "FIREBASE_PROJECT_ID", buildConfigString(productionFirebaseProjectId))
            buildConfigField("String", "FIREBASE_APP_ID", buildConfigString(productionFirebaseAppId))
            buildConfigField("String", "FIREBASE_API_KEY", buildConfigString(productionFirebaseApiKey))
            buildConfigField("String", "FIREBASE_SENDER_ID", buildConfigString(productionFirebaseSenderId))
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.core:core:1.17.0")
    implementation("androidx.activity:activity:1.13.0")

    // CameraX owns Diewish capture/scanning UX consistently across vendors.
    val cameraXVersion = "1.6.2"
    implementation("androidx.camera:camera-core:$cameraXVersion")
    implementation("androidx.camera:camera-camera2:$cameraXVersion")
    implementation("androidx.camera:camera-lifecycle:$cameraXVersion")
    implementation("androidx.camera:camera-view:$cameraXVersion")

    // Bundled/on-device retail barcode decoder. No scan frame leaves the phone.
    implementation("com.google.mlkit:barcode-scanning:17.3.0")

    // Firebase is initialized from build-type-scoped public client values. No
    // service-account secret or private key is stored in the APK.
    implementation(platform("com.google.firebase:firebase-bom:34.19.0"))
    implementation("com.google.firebase:firebase-messaging")

    implementation("com.android.billingclient:billing:9.1.0")

    testImplementation("junit:junit:4.13.2")
}
