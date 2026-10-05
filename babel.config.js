module.exports = function (api) {
  api.cache(true);
  let plugins = [];

  plugins.push("react-native-worklets/plugin");

  // Whether babel-preset-expo hoists to the top level or stays nested under
  // expo/node_modules depends on the installer (npm vs pnpm, hoisted vs
  // isolated) — this repo has seen both layouts, so try both.
  let expoPreset;
  try {
    expoPreset = require.resolve("babel-preset-expo");
  } catch {
    expoPreset = require.resolve("expo/node_modules/babel-preset-expo");
  }

  return {
    presets: [[expoPreset, { jsxImportSource: "nativewind" }], "nativewind/babel"],
    plugins,
  };
};
