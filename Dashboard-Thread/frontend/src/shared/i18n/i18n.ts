import en from "@/shared/i18n/locales/en.json";
import vi from "@/shared/i18n/locales/vi.json";
import type { Locale } from "@/shared/i18n/i18n.types";
import { store } from "@/shared/store/store";

const STORAGE_KEY = "dashboard-thread.locale";

type Dict = Record<string, unknown>;

const DICTS: Record<Locale, Dict> = {
  en: en as Dict,
  vi: vi as Dict,
};

function getByPath(dict: Dict, key: string): unknown {
  const parts = key.split(".").filter(Boolean);
  let cur: unknown = dict;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_m, name: string) => {
    const v = params[name];
    return v == null ? "" : String(v);
  });
}

export function detectInitialLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const fromStorage = window.localStorage.getItem(STORAGE_KEY);
  if (fromStorage === "en" || fromStorage === "vi") return fromStorage;
  const nav = (navigator.language || "").toLowerCase();
  if (nav.startsWith("vi")) return "vi";
  return "en";
}

export function persistLocale(locale: Locale): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, locale);
}

export function t(key: string, params?: Record<string, string | number>): string {
  const state = store.getState() as unknown as { i18n?: { locale?: Locale } };
  const locale: Locale = state.i18n?.locale ?? "en";

  const primary = DICTS[locale];
  const fallback = DICTS.en;

  const v1 = getByPath(primary, key);
  const v2 = getByPath(fallback, key);
  const raw = typeof v1 === "string" ? v1 : typeof v2 === "string" ? v2 : key;
  return interpolate(raw, params);
}

