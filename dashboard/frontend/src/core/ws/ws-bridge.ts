import { io, type Socket } from "socket.io-client";
import type { Store } from "@reduxjs/toolkit";
import { EVENTS } from "shared/src/events";
import type { RootState } from "@/core/store/store";
import { wsConnectionActions } from "@/core/store/slices/ws-connection.slice";
import { configActions } from "@/core/store/slices/config.slice";
import { brActions } from "@/core/store/slices/br.slice";
import { otActions } from "@/core/store/slices/ot.slice";
import { tablesActions } from "@/core/store/slices/tables.slice";
import { systemActions, type SystemInfo } from "@/core/store/slices/system.slice";

import type {
  BrConnectionConfigFromBackend,
  ConnectionStatus,
  OtConfig,
  OtTableData,
  OtThreadState,
} from "@/core/types/websocket.type";

const WS_URL =
  import.meta.env?.VITE_WS_URL ??
  (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function startWsBridge(store: Store<RootState>): void {
  if (socket?.connected) return;

  socket = io(WS_URL, {
    transports: ["websocket", "polling"],
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: Infinity,
    withCredentials: false,
  });

  socket.on("connect", () => {
    store.dispatch(wsConnectionActions.connected());
    store.dispatch(configActions.clearError());
    store.dispatch(brActions.clearError());
    socket?.emit(EVENTS.CONFIG_GET);
    socket?.emit(EVENTS.BR_STATUS);
    socket?.emit(EVENTS.OT_GET_THREAD_RUN_ON_CONNECT);
  });

  socket.on("disconnect", () => {
    store.dispatch(wsConnectionActions.disconnected());
    store.dispatch(brActions.clear());
    store.dispatch(systemActions.clear());
    store.dispatch(otActions.clearBrData());
    store.dispatch(tablesActions.clearBrData());
  });

  socket.on("connect_error", (err: { message: string }) => {
    store.dispatch(wsConnectionActions.connectError(err.message));
    store.dispatch(brActions.brError(err.message));
  });

  socket.on(EVENTS.CONFIG_CURRENT, (data: BrConnectionConfigFromBackend | null) => {
    store.dispatch(configActions.configReceived(data));
  });

  socket.on(EVENTS.CONFIG_SAVED, (data: BrConnectionConfigFromBackend) => {
    store.dispatch(configActions.configSaved(data));
  });

  socket.on(EVENTS.CONFIG_UPDATED, (data: BrConnectionConfigFromBackend) => {
    store.dispatch(configActions.configUpdated(data));
  });

  socket.on(EVENTS.CONFIG_ERROR, (data: { error?: string }) => {
    store.dispatch(configActions.configError(data?.error ?? "Config error"));
  });

  socket.on(EVENTS.BR_STATUS, (data: ConnectionStatus) => {
    store.dispatch(brActions.brStatusReceived(data));
    if (!data?.isConnected) {
      store.dispatch(otActions.clearBrData());
      store.dispatch(tablesActions.clearBrData());
      store.dispatch(systemActions.clear());
    }
  });

  socket.on(EVENTS.BR_CONNECTED, (data: { success: boolean; status?: ConnectionStatus }) => {
    store.dispatch(brActions.brConnected({ status: data.status }));
  });

  socket.on(EVENTS.BR_DISCONNECTED, () => {
    store.dispatch(brActions.brDisconnected());
    store.dispatch(otActions.clearBrData());
    store.dispatch(tablesActions.clearBrData());
    store.dispatch(systemActions.clear());
  });

  socket.on(EVENTS.BR_ERROR, (data: { error?: string }) => {
    store.dispatch(brActions.brError(data?.error ?? "BR connection error"));
  });

  socket.on(EVENTS.OT_CONFIG, (data: OtConfig) => {
    store.dispatch(otActions.otConfigReceived(data));
  });

  socket.on(EVENTS.OT_THREAD_STATE, (data: OtThreadState) => {
    store.dispatch(otActions.threadStateReceived(data));
  });

  socket.on(EVENTS.OT_THREAD_RUN_ON_CONNECT, (data: { runOnConnect: boolean }) => {
    store.dispatch(otActions.threadRunOnConnectReceived(data));
  });

  socket.on(EVENTS.OT_ROUTER_TABLE, (data: OtTableData) => {
    store.dispatch(tablesActions.routerTableReceived(data));
  });

  socket.on(EVENTS.OT_CHILD_TABLE, (data: OtTableData) => {
    store.dispatch(tablesActions.childTableReceived(data));
  });

  socket.on(EVENTS.OT_JOINER_TABLE, (data: OtTableData) => {
    store.dispatch(tablesActions.joinerTableReceived(data));
  });

  socket.on(EVENTS.SYSTEM_INFO, (data: SystemInfo) => {
    store.dispatch(systemActions.systemInfoReceived(data ?? null));
  });
}
