plugins {
    id("com.android.application")
}

val stagingWebBaseUrl = providers.gradleProperty("DIEWISH_WEB_BASE_URL")
    .orElse("https://staging.invalid")
    .get()
val productionWebBaseUrl = providers.gradleProperty("DIEWISH_PRODUCTION_WEB_BASE_URL")
    .orElse("https://diewish-frontend-730419163638.europe-west1.run.app")
    .get()
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

        buildConfigField("String", "BUILD_REVISION", "\"${buildRevision}\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        debug {
            versionNameSuffix = "-dev.${buildRevision}"
            // Debug APKs must never silently target production. The staging
            // deployment workflow supplies DIEWISH_WEB_BASE_URL explicitly.
            buildConfigField("String", "WEB_BASE_URL", "\"${stagingWebBaseUrl}\"")
            buildConfigField("String", "APP_ENVIRONMENT", "\"staging\"")
        }
        release {
            isMinifyEnabled = true
            buildConfigField("String", "WEB_BASE_URL", "\"${productionWebBaseUrl}\"")
            buildConfigField("String", "APP_ENVIRONMENT", "\"production\"")
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

    implementation("com.android.billingclient:billing:9.1.0")
}
