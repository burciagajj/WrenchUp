const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, {
  input: "./global.css",
  // Force write CSS to file system instead of virtual modules in dev only.
  // This fixes iOS styling issues in development mode, but in production
  // exports (NODE_ENV=production, e.g. EAS builds) it causes Metro to lose
  // a race against react-native-css-interop's own cache writes during
  // static server export — "Failed to get the SHA-1 for:
  // .../react-native-css-interop/.cache/*.js" — which fails the build.
  forceWriteFileSystem: process.env.NODE_ENV !== "production",
});
