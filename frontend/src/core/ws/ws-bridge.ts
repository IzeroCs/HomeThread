import type { Socket } from "socket.io-client";
import type { Store } from "@reduxjs/toolkit";
import { EVENTS } from "shared/src/events";
import type { RootState } from "@/store/store";
import { wsConnectionActions } from "@namorix/core/store";
import { configActions } from "@/store/slices/config.slice";
import { brActions } from "@/store/slices/br.slice";
import { otActions } from "@/store/slices/ot.slice";
import { tablesActions } from "@/store/slices/tables.slice";
import { systemActions, type SystemInfo } from "@/store/slices/system.slice";
import { setLocale } from "@namorix/core/store";
import { normalizeLocale } from "@namorix/core/i18n";
import { bindAddonControlWsEvent, createWsBridge } from "@namorix/core/ws";

import type {
  BrConnectionConfigFromBackend,
  ConnectionStatus,
  OtConfig,
  OtTableData,
  OtThreadState,
} from "@/shared/types/websocket.type";

const WS_URL_DEFAULT =
  import.meta.env?.VITE_WS_URL ??
  (typeof window !== "undefined" ? window.location.origin : "");

let bridge: ReturnType<typeof createWsBridge<RootState>> | null = null;
let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export type WsBridgeStartOptions = {
  url?: string;
  path?: string;
  auth?: Record<string, unknown>;
  transports?: ("websocket" | "polling")[];
  query?: Record<string, string>;
};

/** Runtime connections go directly to addon backend Socket.IO endpoint. */
export function startWsBridge(store: Store<RootState>, options?: WsBridgeStartOptions): void {
  const wsUrl = options?.url?.trim() || WS_URL_DEFAULT;
  if (!wsUrl) {
    store.dispatch(wsConnectionActions.connectError("Addon backend URL is unavailable"));
    return;
  }
  if (!bridge) {
    bridge = createWsBridge<RootState>({
      store,
      url: wsUrl,
      options: {
        path: options?.path,
        auth: options?.auth,
        transports: options?.transports,
        query: options?.query,
      },
    });

    bridge
      .onConnect((socket, store) => {
        store.dispatch(wsConnectionActions.connected());
        store.dispatch(configActions.clearError());
        store.dispatch(brActions.clearError());
        socket.emit(EVENTS.CONFIG_GET);
        socket.emit(EVENTS.BR_STATUS);
        socket.emit(EVENTS.OT_GET_THREAD_RUN_ON_CONNECT);
      })
      .onDisconnect((_socket, store) => {
        store.dispatch(wsConnectionActions.disconnected());
        store.dispatch(brActions.clear());
        store.dispatch(systemActions.clear());
        store.dispatch(otActions.clearBrData());
        store.dispatch(tablesActions.clearBrData());
      })
      .onConnectError((_socket, store, err) => {
        store.dispatch(wsConnectionActions.connectError(err.message));
        store.dispatch(brActions.brError(err.message));
      })
      .on(EVENTS.CONFIG_CURRENT, (store, data) => {
        const typed = data as BrConnectionConfigFromBackend | null;
        store.dispatch(configActions.configReceived(typed));
        const locale = (typed as any)?.locale;
        if (typeof locale === "string") store.dispatch(setLocale(normalizeLocale(locale)));
      })
      .on(EVENTS.CONFIG_SAVED, (store, data) => {
        const typed = data as BrConnectionConfigFromBackend;
        store.dispatch(configActions.configSaved(typed));
        const locale = (typed as any)?.locale;
        if (typeof locale === "string") store.dispatch(setLocale(normalizeLocale(locale)));
      })
      .on(EVENTS.CONFIG_UPDATED, (store, data) => {
        const typed = data as BrConnectionConfigFromBackend;
        store.dispatch(configActions.configUpdated(typed));
        const locale = (typed as any)?.locale;
        if (typeof locale === "string") store.dispatch(setLocale(normalizeLocale(locale)));
      })
      .on(EVENTS.CONFIG_ERROR, (store, data) => {
        const typed = data as { error?: string };
        store.dispatch(configActions.configError(typed?.error ?? "Config error"));
      })
      .on(EVENTS.BR_STATUS, (store, data) => {
        const typed = data as ConnectionStatus;
        store.dispatch(brActions.brStatusReceived(typed));
        if (!typed?.isConnected) {
          store.dispatch(otActions.clearBrData());
          store.dispatch(tablesActions.clearBrData());
          store.dispatch(systemActions.clear());
        }
      })
      .on(EVENTS.BR_CONNECTED, (store, data) => {
        const typed = data as { success: boolean; status?: ConnectionStatus };
        store.dispatch(brActions.brConnected({ status: typed.status }));
      })
      .on(EVENTS.BR_DISCONNECTED, (store) => {
        store.dispatch(brActions.brDisconnected());
        store.dispatch(otActions.clearBrData());
        store.dispatch(tablesActions.clearBrData());
        store.dispatch(systemActions.clear());
      })
      .on(EVENTS.BR_ERROR, (store, data) => {
        const typed = data as { error?: string };
        store.dispatch(brActions.brError(typed?.error ?? "BR connection error"));
      })
      .on(EVENTS.OT_CONFIG, (store, data) => store.dispatch(otActions.otConfigReceived(data as OtConfig)))
      .on(EVENTS.OT_THREAD_STATE, (store, data) =>
        store.dispatch(otActions.threadStateReceived(data as OtThreadState)),
      )
      .on(EVENTS.OT_THREAD_RUN_ON_CONNECT, (store, data) =>
        store.dispatch(otActions.threadRunOnConnectReceived(data as { runOnConnect: boolean })),
      )
      .on(EVENTS.OT_ROUTER_TABLE, (store, data) =>
        store.dispatch(tablesActions.routerTableReceived(data as OtTableData)),
      )
      .on(EVENTS.OT_CHILD_TABLE, (store, data) =>
        store.dispatch(tablesActions.childTableReceived(data as OtTableData)),
      )
      .on(EVENTS.OT_JOINER_TABLE, (store, data) =>
        store.dispatch(tablesActions.joinerTableReceived(data as OtTableData)),
      )
      .on(EVENTS.SYSTEM_INFO, (store, data) =>
        store.dispatch(systemActions.systemInfoReceived((data ?? null) as SystemInfo)),
      );
    bindAddonControlWsEvent(bridge as any, EVENTS.ADDON_CONTROL_STATE, {
      onBlockedOrRevoked: () => {
        stopWsBridge({ close: true });
      },
    });
  }

  socket = bridge.start();
}

export function stopWsBridge(opts?: { close?: boolean }): void {
  bridge?.stop(opts);
  if (opts?.close) socket = null;
}
