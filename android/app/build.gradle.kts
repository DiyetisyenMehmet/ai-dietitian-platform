plugins {
    id("com.android.application")
}

val diewishWebBaseUrl = providers.gradleProperty("DIEWISH_WEB_BASE_URL")
    .orElse("https://diewish-frontend-730419163638.europe-west1.run.app")
    .get()

android {
    namespace = "com.diewish.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.diewish.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"

        buildConfigField("String", "WEB_BASE_URL", "\"${diewishWebBaseUrl}\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = true
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
    implementation("com.android.billingclient:billing:9.1.0")
}
