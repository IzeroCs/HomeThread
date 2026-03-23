import { initI18n } from "@namorix/core/i18n";
import en from "@/core/i18n/locales/en.json";
import vi from "@/core/i18n/locales/vi.json";
import { store } from "@/store/store";

export const { t } = initI18n<"en" | "vi">({
  store,
  dicts: { en, vi },
  fallbackLocale: "en",
});
