import { useCallback, useMemo } from "react";
import { useStore } from "@/lib/store";
import {
  formatPrice,
  localeForRegion,
  resolveRegion,
  toChargeableAmount,
  translate,
  type StringKey,
} from "@/lib/i18n";
import type { LocaleCode, RegionCode } from "@/lib/types";

function getTestRegionOverride(): RegionCode | null {
  const configured = (process.env.EXPO_PUBLIC_TEST_REGION ?? "").trim().toUpperCase();
  if (configured === "MX" || configured === "US") return configured;

  // No dev-mode default override here on purpose — a missing
  // EXPO_PUBLIC_TEST_REGION should mean "follow the real device/stored
  // region," not silently force MX. That's the exact bug this app shipped
  // with before (region defaulted to MX regardless of the user's actual
  // location); don't reintroduce it just because a future dev's .env is
  // missing this one var. Set EXPO_PUBLIC_TEST_REGION explicitly if you need
  // a fixed region for local testing.
  return null;
}

export function useRegion(): RegionCode {
  const { state } = useStore();
  return getTestRegionOverride() ?? resolveRegion(state.regionPreference, state.detectedCountry);
}

export function useLocale(): LocaleCode {
  return localeForRegion(useRegion());
}

export function useT() {
  const locale = useLocale();
  return useCallback(
    (key: StringKey, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale],
  );
}

/**
 * Stable bilingual helper for legacy / one-off strings.
 * Use this instead of defining `const L = (en, es) => ...` inside components.
 * This prevents the function from being recreated on every render (which triggers exhaustive-deps warnings).
 */
export function useL() {
  const locale = useLocale();
  const isEs = locale === "es-MX";
  return useCallback((en: string, es: string) => (isEs ? es : en), [isEs]);
}

export function useFormatPrice() {
  const region = useRegion();
  return useCallback((usd: number) => formatPrice(usd, region), [region]);
}

/**
 * Converts a raw USD fare amount into the real amount to charge/store for
 * the current region (discount + currency conversion for MX, passthrough
 * for US). Use this — not the raw USD number — for anything that feeds
 * Stripe's `amount` or a DB column read back later without further currency
 * logic (offeredPrice, platformFeeAmount, mechanicPayout).
 */
export function useChargeableAmount() {
  const region = useRegion();
  return useCallback((usd: number) => toChargeableAmount(usd, region), [region]);
}

export function useLocaleContext() {
  const region = useRegion();
  const locale = useLocale();
  const t = useT();
  const formatPriceFn = useFormatPrice();
  const chargeableAmountFn = useChargeableAmount();
  return useMemo(
    () => ({
      region,
      locale,
      t,
      formatPrice: formatPriceFn,
      toChargeableAmount: chargeableAmountFn,
      isMexico: region === "MX",
    }),
    [region, locale, t, formatPriceFn, chargeableAmountFn],
  );
}
