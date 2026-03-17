import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Locale } from "@/shared/i18n/i18n.types";
import { detectInitialLocale, persistLocale } from "@/shared/i18n/i18n";

export interface I18nState {
  locale: Locale;
}

const initialState: I18nState = {
  locale: detectInitialLocale(),
};

const slice = createSlice({
  name: "i18n",
  initialState,
  reducers: {
    setLocale(state, action: PayloadAction<Locale>) {
      state.locale = action.payload;
      persistLocale(action.payload);
    },
  },
});

export const i18nActions = slice.actions;
export const i18nReducer = slice.reducer;

