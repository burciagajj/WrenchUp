import { useCallback, useMemo } from "react";
import { useStore } from "@/lib/store";
import {
  formatPrice,
  localeForRegion,
  resolveRegion,
  translate,
  type StringKey,
} from "@/lib/i18n";
import type { LocaleCode, RegionCode } from "@/lib/types";

export function useRegion(): RegionCode {
  const { state } = useStore();
  return resolveRegion(state.regionPreference, state.detectedCountry);
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

export function useFormatPrice() {
  const region = useRegion();
  return useCallback((usd: number) => formatPrice(usd, region), [region]);
}

export function useLocaleContext() {
  const region = useRegion();
  const locale = useLocale();
  const t = useT();
  const formatPriceFn = useFormatPrice();
  return useMemo(
    () => ({ region, locale, t, formatPrice: formatPriceFn, isMexico: region === "MX" }),
    [region, locale, t, formatPriceFn],
  );
}
