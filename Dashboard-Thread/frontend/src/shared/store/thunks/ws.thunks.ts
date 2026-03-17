import { createAsyncThunk } from "@reduxjs/toolkit";
import { EVENTS } from "shared/src/events";
import type { RootState } from "@/shared/store/store";
import { getSocket } from "@/shared/ws/ws-bridge";
import type { OtConfig } from "@shared/types/websocket.type";

function onceWithTimeout<T>(
  event: string,
  timeoutMs: number,
  emit: () => void
): Promise<T | null> {
  return new Promise((resolve) => {
    const socket = getSocket();
    if (!socket) {
      resolve(null);
      return;
    }

    let done = false;
    const handler = (payload: T) => {
      if (done) return;
      done = true;
      clearTimeout(timeoutId);
      socket.off(event, handler as never);
      resolve(payload);
    };

    socket.once(event, handler as never);
    emit();

    const timeoutId = window.setTimeout(() => {
      if (done) return;
      done = true;
      socket.off(event, handler as never);
      resolve(null);
    }, timeoutMs);
  });
}

export const wsTestBrConnect = createAsyncThunk<
  { success: boolean; error?: string },
  { brHost: string; brPort: number },
  { state: RootState }
>("ws/testBrConnect", async (payload) => {
  const socket = getSocket();
  if (!socket) return { success: false, error: "Not connected" };

  const result = await onceWithTimeout<{ success: boolean; error?: string }>(
    EVENTS.BR_TEST_RESULT,
    6000,
    () => socket.emit(EVENTS.BR_TEST, payload)
  );

  return result ?? { success: false, error: "Timeout" };
});

export const wsGetOtConfig = createAsyncThunk<OtConfig | null, void, { state: RootState }>(
  "ws/getOtConfig",
  async () => {
    const socket = getSocket();
    if (!socket) return null;

    const result = await onceWithTimeout<OtConfig>(EVENTS.OT_CONFIG, 6000, () =>
      socket.emit(EVENTS.OT_GET_CONFIG)
    );

    return result ?? null;
  }
);

export const wsSetOtConfig = createAsyncThunk<
  { success: boolean; error?: string },
  { panid?: string; channel?: number; networkName?: string; extendedPanId?: string; networkKey?: string },
  { state: RootState }
>("ws/setOtConfig", async (payload) => {
  const socket = getSocket();
  if (!socket) return { success: false, error: "Not connected" };

  const result = await onceWithTimeout<{ success: boolean; error?: string }>(
    EVENTS.OT_SET_CONFIG_RESULT,
    6000,
    () => socket.emit(EVENTS.OT_SET_CONFIG, payload)
  );

  return result ?? { success: false, error: "Timeout" };
});

export const wsSetThreadRunning = createAsyncThunk<
  { success: boolean; error?: string },
  { running: boolean },
  { state: RootState }
>("ws/setThreadRunning", async ({ running }) => {
  const socket = getSocket();
  if (!socket) return { success: false, error: "Not connected" };

  const result = await onceWithTimeout<{ success: boolean; error?: string }>(
    EVENTS.OT_SET_THREAD_RUNNING_RESULT,
    6000,
    () => socket.emit(EVENTS.OT_SET_THREAD_RUNNING, { running })
  );

  return result ?? { success: false, error: "Timeout" };
});

export const wsStartThread = createAsyncThunk<{ success: boolean; error?: string }, void, { state: RootState }>(
  "ws/startThread",
  async () => {
    const socket = getSocket();
    if (!socket) return { success: false, error: "Not connected" };

    const result = await onceWithTimeout<{ success: boolean; error?: string }>(
      EVENTS.OT_START_THREAD_RESULT,
      6000,
      () => socket.emit(EVENTS.OT_START_THREAD)
    );

    return result ?? { success: false, error: "Timeout" };
  }
);

export const wsStopThread = createAsyncThunk<{ success: boolean; error?: string }, void, { state: RootState }>(
  "ws/stopThread",
  async () => {
    const socket = getSocket();
    if (!socket) return { success: false, error: "Not connected" };

    const result = await onceWithTimeout<{ success: boolean; error?: string }>(
      EVENTS.OT_STOP_THREAD_RESULT,
      6000,
      () => socket.emit(EVENTS.OT_STOP_THREAD)
    );

    return result ?? { success: false, error: "Timeout" };
  }
);

export const wsCommissionerConnect = createAsyncThunk<
  { success: boolean; error?: string },
  { eui64: string; psk: string; timeoutSeconds?: number },
  { state: RootState }
>("ws/commissionerConnect", async ({ eui64, psk, timeoutSeconds }) => {
  const socket = getSocket();
  if (!socket) return { success: false, error: "Not connected" };

  const result = await onceWithTimeout<{ success: boolean; error?: string }>(
    EVENTS.COMMISSIONER_CONNECT_RESULT,
    6000,
    () => socket.emit(EVENTS.COMMISSIONER_CONNECT, { eui64, psk, timeout: timeoutSeconds })
  );

  return result ?? { success: false, error: "Timeout" };
});

export const wsResetDevice = createAsyncThunk<{ success: boolean; error?: string }, void, { state: RootState }>(
  "ws/resetDevice",
  async () => {
    const socket = getSocket();
    if (!socket) return { success: false, error: "Not connected" };

    const result = await onceWithTimeout<{ success: boolean; error?: string }>(
      EVENTS.DEVICE_RESET_RESULT,
      6000,
      () => socket.emit(EVENTS.DEVICE_RESET)
    );

    return result ?? { success: false, error: "Timeout" };
  }
);

export const wsFactoryResetDevice = createAsyncThunk<
  { success: boolean; error?: string },
  void,
  { state: RootState }
>("ws/factoryResetDevice", async () => {
  const socket = getSocket();
  if (!socket) return { success: false, error: "Not connected" };

  const result = await onceWithTimeout<{ success: boolean; error?: string }>(
    EVENTS.DEVICE_FACTORY_RESET_RESULT,
    6000,
    () => socket.emit(EVENTS.DEVICE_FACTORY_RESET)
  );

  return result ?? { success: false, error: "Timeout" };
});

