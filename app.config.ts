// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

// Store-facing app identifier — iOS bundleIdentifier and Android package name.
// This is what App Store Connect / Play Console register as the app's
// permanent identity; changing it after first submission effectively means
// shipping a brand-new app listing, so it should stay fixed from here on.
const bundleId = "com.wrenchup.app";

// Native deep-link scheme (wrenchup://). Baked into the native app, so changing
// it needs a new build. It must match `urlScheme` in components/stripe-provider.tsx
// (Stripe returns here after 3D Secure / bank redirects) and the scheme in
// app/api/connect-return+api.ts (the Stripe Connect landing page that hands
// mechanics back into the app) and constants/oauth.ts. It used to be an
// auto-generated "manus..." value from the project template.
const appScheme = "wrenchup";

const env = {
  // App branding - update these values directly (do not use env vars)
  appName: "WrenchUp",
  appSlug: "wrenchup",
  // S3 URL of the app logo - set this to the URL returned by generate_image when creating custom logo
  // Leave empty to use the default icon from assets/images/icon.png
  logoUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663648379316/6AkrRTbkcpXwLWfiVUHSjP/wrenchup-icon-7GaQ75pa44WV4Lz7vgzvh4.png",
  scheme: appScheme,
  iosBundleId: bundleId,
  androidPackage: bundleId,
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: "1.0.0",
  runtimeVersion: {
    policy: "appVersion",
  },
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false
      }
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#000000",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    permissions: ["POST_NOTIFICATIONS"],
    config: {
      googleMaps: {
        // react-native-maps has no Apple-Maps-style fallback on Android — it
        // always renders via the Google Maps Android SDK, and that SDK
        // refuses to draw anything (blank grey tiles) without this key. Get
        // one from https://console.cloud.google.com/google/maps-apis with
        // the "Maps SDK for Android" enabled, restricted to this app's
        // package name + SHA-1 signing fingerprint. Used by home-map.tsx,
        // live-map.tsx, and service-map-hero.tsx — all core to dispatch.
        apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY,
      },
    },
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: env.scheme,
            host: "*",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    // "server" (not "static") so app/api/*+api.ts routes actually get built
    // and served — required for EAS Hosting deploys to serve the Stripe
    // payment-intent/verify/capture-sweep routes and the offer-expiry sweep.
    // Static export would silently drop all API routes.
    output: "server",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-font",
    "expo-web-browser",
    "expo-asset",
    [
      "expo-notifications",
      {
        icon: "./assets/images/android-icon-monochrome.png",
        color: "#F97316",
        defaultChannel: "default",
        sounds: [],
        enableBackgroundRemoteNotifications: true,
      },
    ],
    [
      "expo-location",
      {
        locationWhenInUsePermission: "Allow $(PRODUCT_NAME) to show your service location and route mechanics to you.",
        // Mechanics only: trip GPS keeps running while they navigate in another
        // app during an active job (lib/mechanic-trip-tracking.ts).
        locationAlwaysAndWhenInUsePermission:
          "Allow $(PRODUCT_NAME) to share your location with the customer during an active job, even when the app is in the background.",
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
        isIosBackgroundLocationEnabled: true,
      },
    ],
    [
      "expo-audio",
      {
        microphonePermission: "Allow $(PRODUCT_NAME) to access your microphone.",
      },
    ],
    [
      "expo-image-picker",
      {
        // Used for profile photos, mechanic verification documents, the
        // camera-only face-verification photo, and before/after job photos.
        // Without these strings iOS refuses to present the camera/library
        // picker at all (crash on launch). use-image-picker.ts only ever
        // requests mediaTypes: ["images"] (no video), so explicitly opt out
        // of the microphone permission this plugin would otherwise also
        // request/describe — expo-audio above already owns that string for
        // its own (unrelated) feature, and requesting mic access nobody uses
        // is exactly the kind of thing App Store review flags.
        cameraPermission: "Allow $(PRODUCT_NAME) to use your camera to take verification and service photos.",
        photosPermission: "Allow $(PRODUCT_NAME) to access your photos to upload verification and service photos.",
        microphonePermission: false,
      },
    ],
    [
      "expo-video",
      {
        supportsBackgroundPlayback: true,
        supportsPictureInPicture: true,
      },
    ],
    [
      "expo-contacts",
      {
        // Customer safety feature: share live trip location with a trusted
        // contact via SMS — see app/tracking.tsx and app/mechanic/active.tsx.
        // Without this string, iOS crashes on Contacts.requestPermissionsAsync().
        contactsPermission: "Allow $(PRODUCT_NAME) to access your contacts so you can share your live trip location with someone you trust.",
      },
    ],
    [
      "expo-local-authentication",
      {
        // Face ID/Touch ID confirmation before accepting/completing a job and
        // at sign-in — see app/confirm.tsx, app/complete.tsx,
        // app/(tabs)/book-service.tsx, app/auth/signin.tsx,
        // app/mechanic/active.tsx. Without this string, iOS crashes the
        // moment authenticateAsync() is called on a Face ID device.
        faceIDPermission: "Allow $(PRODUCT_NAME) to use Face ID to confirm it's you.",
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#F97316",
        dark: {
          backgroundColor: "#0B1220",
        },
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          buildArchs: ["armeabi-v7a", "arm64-v8a"],
          minSdkVersion: 24,
        },
        ios: {
          // expo-build-properties requires >= 15.1; Stripe RN needs >= 13.4.
          deploymentTarget: "15.1",
        },
      },
    ],
    [
      "./plugins/withStripeConfig.js",
      {
        // Set this to your real merchant identifier when you enable Apple Pay.
        merchantIdentifier: "merchant.com.wrenchup.app",
        enableGooglePay: true,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  updates: {
    enabled: true,
    // Prevent startup failures when remote update endpoints are slow/unreachable.
    // App launches from embedded/cached bundle first, then updates recover in background.
    fallbackToCacheTimeout: 0,
    checkAutomatically: "ON_ERROR_RECOVERY",
  },

  // ← Added this for EAS
  extra: {
    eas: {
      projectId: "37ff1bd3-c9c1-4a42-a181-88e9702d3ed9"
    }
  }
};

export default config;
