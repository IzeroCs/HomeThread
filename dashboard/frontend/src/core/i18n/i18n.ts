import en from "@/core/i18n/locales/en.json"
import vi from "@/core/i18n/locales/vi.json"
import { store } from "@/store/store"
import {
  createStoreBoundTranslator,
  type Locale,
} from "@namorix/core/i18n"
import { selectLocale } from "@/store/selectors"

type Dict = Record<string, unknown>

const DICTS: Record<Locale, Dict> = {
  en: en as Dict,
  vi: vi as Dict,
}

const translate = createStoreBoundTranslator({
  store,
  selectLocale,
  dicts: DICTS,
  fallbackLocale: "en",
})

export function t(
  key: string,
  params?: Record<string, string | number>,
): string {
  return translate(key, params)
}
