const { themeColors } = require("./theme.config");
const plugin = require("tailwindcss/plugin");

const tailwindColors = Object.fromEntries(
  Object.entries(themeColors).map(([name, swatch]) => [
    name,
    {
      DEFAULT: `var(--color-${name})`,
      light: swatch.light,
      dark: swatch.dark,
    },
  ]),
);

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  // Scan all component and app files for Tailwind classes
  content: ["./app/**/*.{js,ts,tsx}", "./components/**/*.{js,ts,tsx}", "./lib/**/*.{js,ts,tsx}", "./hooks/**/*.{js,ts,tsx}"],

  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        ...tailwindColors,
        "wrench-base": "#13151B",
        "wrench-surface": "#1C1F29",
        "wrench-surface-raised": "#242836",
        "wrench-hairline": "rgba(255,255,255,0.08)",
        "wrench-orange": "#FF6A39",
        "wrench-orange-deep": "#E04E1E",
        "wrench-teal": "#2FDFC4",
        "wrench-red": "#FF5C5C",
        "wrench-text": "#F6F5F2",
        "wrench-muted": "#8C8FA0",
        "wrench-faint": "#5C5F6E",
      },
      fontFamily: {
        display: ["Oswald_600SemiBold"],
        "display-medium": ["Oswald_500Medium"],
        body: ["Inter_400Regular"],
        "body-medium": ["Inter_500Medium"],
        "body-semibold": ["Inter_600SemiBold"],
      },
    },
  },
  plugins: [
    plugin(({ addVariant }) => {
      addVariant("light", ':root:not([data-theme="dark"]) &');
      addVariant("dark", ':root[data-theme="dark"] &');
    }),
  ],
};
