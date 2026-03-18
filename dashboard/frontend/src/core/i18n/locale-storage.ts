import {
  createLocaleStorage,
  normalizeLocale,
  type Locale,
} from "@namorix/core/i18n";

const localeStorage = createLocaleStorage({
  key: "dashboard-thread.locale",
  defaultLocale: "en",
});

export function detectInitialLocale(): Locale {
  return normalizeLocale(localeStorage.detectInitialLocale());
}

export function persistLocale(locale: Locale): void {
  localeStorage.persistLocale(locale);
}

