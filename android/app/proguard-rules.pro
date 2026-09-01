# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# --- Added when enabling minifyEnabled/shrinkResources (see build.gradle) ---
# Capacitor's own library module (node_modules/@capacitor/android) already
# declares consumerProguardFiles keeping every Plugin subclass and
# @PluginMethod-annotated method, so nothing extra is needed for the
# Capacitor bridge itself. These are belt-and-suspenders for third-party
# native SDKs this app depends on directly, in case their own published
# consumer rules ever fall short:
-keep class com.revenuecat.purchases.** { *; }
-keep class com.getcapacitor.** { *; }
-keep class com.capacitorjs.** { *; }
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }

# Any WebView JS-interface method must survive obfuscation, or the bridge
# from JS into native code silently breaks at runtime instead of failing to
# build — there's no custom one in this app today, but this is the standard
# safety net for any hybrid app using WebView.addJavascriptInterface.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# R8-generated (build/outputs/mapping/release/missing_rules.txt): a Firebase
# Kotlin-extension class referenced by firebase-installations' bytecode but
# never actually used by this app (push-notifications only uses the plain
# Java APIs) — safe to tell R8 not to fail over not being able to fully
# resolve it.
-dontwarn com.google.firebase.ktx.Firebase
