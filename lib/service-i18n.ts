import { translate, type StringKey } from "./i18n";
import type { LocaleCode, ServiceCode } from "./types";

export function localizedServiceName(code: ServiceCode, locale: LocaleCode): string {
  return translate(locale, `service.${code}` as StringKey);
}

export function localizedServiceDesc(code: ServiceCode, locale: LocaleCode): string {
  return translate(locale, `service.${code}_desc` as StringKey);
}
