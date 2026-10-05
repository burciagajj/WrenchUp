/** @type {const} */
const themeColors = {
  primary: { light: '#F97316', dark: '#FB923C' },
  background: { light: '#FFFFFF', dark: '#0B1220' },
  surface: { light: '#F5F7FA', dark: '#111827' },
  foreground: { light: '#0F172A', dark: '#F1F5F9' },
  muted: { light: '#475569', dark: '#94A3B8' }, // Better contrast for text on dark backgrounds (used in labels, placeholders, secondary text on signin/signup/profile etc.)
  border: { light: '#CBD5E1', dark: '#374151' }, // Stronger contrast for borders and dividers
  success: { light: '#10B981', dark: '#34D399' },
  warning: { light: '#F59E0B', dark: '#FBBF24' },
  error: { light: '#DC2626', dark: '#FCA5A5' }, // Stronger contrast for error states
};
module.exports = { themeColors };
