import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ConnectionStatus } from "@/core/types/websocket.type";

export interface BrState {
  brStatus: ConnectionStatus | null;
  brError: string | null;
}

const initialState: BrState = {
  brStatus: null,
  brError: null,
};

const slice = createSlice({
  name: "br",
  initialState,
  reducers: {
    brStatusReceived(state, action: PayloadAction<ConnectionStatus>) {
      state.brStatus = action.payload ?? null;
      state.brError = null;
    },
    brConnected(state, action: PayloadAction<{ status?: ConnectionStatus }>) {
      if (action.payload?.status) state.brStatus = action.payload.status;
      state.brError = null;
    },
    brDisconnected(state) {
      state.brStatus = state.brStatus ? { ...state.brStatus, isConnected: false } : null;
    },
    brError(state, action: PayloadAction<string>) {
      state.brError = action.payload;
    },
    clearError(state) {
      state.brError = null;
    },
    clear(state) {
      state.brStatus = null;
      state.brError = null;
    },
  },
});

export const brActions = slice.actions;
export const brReducer = slice.reducer;
