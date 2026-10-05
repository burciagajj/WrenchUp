import type { PaymentSheet } from "@stripe/stripe-react-native";
import { ThemeColors } from "./_core/theme";

const { primary, background, surface, foreground, muted, border, error } = ThemeColors;

/**
 * Shared PaymentSheet look for both the checkout flow (use-payment-sheet.ts)
 * and add-card flow (use-add-card.ts) — mirrors the app's own light/dark
 * tokens (theme.config.js) so Stripe's native sheet doesn't look like a
 * different app bolted on, and rounds corners well past Stripe's flat 6pt
 * default to match the app's card/button radius.
 */
export const PAYMENT_SHEET_APPEARANCE: PaymentSheet.AppearanceParams = {
  colors: {
    light: {
      primary: primary.light,
      background: background.light,
      componentBackground: surface.light,
      componentBorder: border.light,
      componentDivider: border.light,
      primaryText: foreground.light,
      secondaryText: muted.light,
      componentText: foreground.light,
      placeholderText: muted.light,
      icon: muted.light,
      error: error.light,
    },
    dark: {
      primary: primary.dark,
      background: background.dark,
      componentBackground: surface.dark,
      componentBorder: border.dark,
      componentDivider: border.dark,
      primaryText: foreground.dark,
      secondaryText: muted.dark,
      componentText: foreground.dark,
      placeholderText: muted.dark,
      icon: muted.dark,
      error: error.dark,
    },
  },
  shapes: {
    borderRadius: 16,
    borderWidth: 1,
  },
  primaryButton: {
    shapes: {
      borderRadius: 16,
    },
    colors: {
      light: { background: primary.light, text: "#FFFFFF" },
      dark: { background: primary.dark, text: "#FFFFFF" },
    },
  },
};
