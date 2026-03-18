import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { PageHeaderAction } from "@/core/components/appbar/appbar";

export type AppBarState = {
  visible: boolean;
  heading: string | null;
  subtitle: string | null;
  actions: PageHeaderAction[];
};

const initialState: AppBarState = {
  visible: false,
  heading: null,
  subtitle: null,
  actions: [],
};

export const appBarSlice = createSlice({
  name: "appBar",
  initialState,
  reducers: {
    setAppBar(
      state,
      action: PayloadAction<{
        heading?: string | null;
        subtitle?: string | null;
        actions?: PageHeaderAction[];
        visible?: boolean;
      }>
    ) {
      state.visible = action.payload.visible ?? true;
      state.heading = action.payload.heading ?? null;
      state.subtitle = action.payload.subtitle ?? null;
      state.actions = action.payload.actions ?? [];
    },
    clearAppBar(state) {
      state.visible = false;
      state.heading = null;
      state.subtitle = null;
      state.actions = [];
    },
  },
});

export const appBarReducer = appBarSlice.reducer;
export const appBarActions = appBarSlice.actions;
