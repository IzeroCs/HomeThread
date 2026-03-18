import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { BrConnectionConfigFromBackend } from "@/core/types/websocket.type";

export interface ConfigState {
  config: BrConnectionConfigFromBackend | null;
  configError: string | null;
}

const initialState: ConfigState = {
  config: null,
  configError: null,
};

const slice = createSlice({
  name: "config",
  initialState,
  reducers: {
    configReceived(state, action: PayloadAction<BrConnectionConfigFromBackend | null>) {
      state.config = action.payload ?? null;
      state.configError = null;
    },
    configSaved(state, action: PayloadAction<BrConnectionConfigFromBackend>) {
      state.config = action.payload;
      state.configError = null;
    },
    configUpdated(state, action: PayloadAction<BrConnectionConfigFromBackend>) {
      state.config = action.payload;
      state.configError = null;
    },
    configError(state, action: PayloadAction<string>) {
      state.configError = action.payload;
    },
    clearError(state) {
      state.configError = null;
    },
    clear(state) {
      state.config = null;
      state.configError = null;
    },
  },
});

export const configActions = slice.actions;
export const configReducer = slice.reducer;
