import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { OtConfig, OtThreadState } from "@shared/types/websocket.type";

export interface OtState {
  otConfig: OtConfig | null;
  threadRunning: boolean | null;
  threadState: string | null;
  threadRunOnConnect: boolean;
}

const initialState: OtState = {
  otConfig: null,
  threadRunning: null,
  threadState: null,
  threadRunOnConnect: false,
};

const slice = createSlice({
  name: "ot",
  initialState,
  reducers: {
    otConfigReceived(state, action: PayloadAction<OtConfig>) {
      const data = action.payload;
      state.otConfig = data?.error ? { error: data.error } : data;
    },
    threadStateReceived(state, action: PayloadAction<OtThreadState>) {
      const data = action.payload;
      if (data?.error) {
        state.threadRunning = null;
        state.threadState = null;
      } else {
        state.threadRunning = data?.running ?? null;
        state.threadState = data?.state ?? null;
      }
    },
    threadRunOnConnectReceived(state, action: PayloadAction<{ runOnConnect: boolean }>) {
      state.threadRunOnConnect = !!action.payload?.runOnConnect;
    },
    clearBrData(state) {
      state.otConfig = null;
      state.threadRunning = null;
      state.threadState = null;
      state.threadRunOnConnect = false;
    },
  },
});

export const otActions = slice.actions;
export const otReducer = slice.reducer;

