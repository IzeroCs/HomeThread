/**
 * ReactiveController: quản lý kết nối WebSocket tới backend (thay thế useWebSocket hook).
 */

import { ReactiveController, ReactiveControllerHost } from "lit";
import { io, Socket } from "socket.io-client";
import type {
  BrConnectionConfigFromBackend,
  ConnectionStatus,
  OtConfig,
  OtThreadState,
  OtTableData,
} from "@shared/types/websocket.type";
import { EVENTS } from "shared/src/events";

const WS_URL =
  import.meta.env?.VITE_WS_URL ??
  (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");

export interface WebSocketControllerState {
  connected: boolean;
  brStatus: ConnectionStatus | null;
  config: BrConnectionConfigFromBackend | null;
  configError: string | null;
  brError: string | null;
  otConfig: OtConfig | null;
  threadRunning: boolean | null;
  threadState: string | null;
  threadRunOnConnect: boolean;
  routerTable: OtTableData | null;
  childTable: OtTableData | null;
  joinerTable: OtTableData | null;
  systemInfo: { ipv4: string[]; ipv6: string[] } | null;
}

export class WebSocketController implements ReactiveController {
  private host: ReactiveControllerHost;
  private socket: Socket | null = null;

  connected = false;
  brStatus: ConnectionStatus | null = null;
  config: BrConnectionConfigFromBackend | null = null;
  configError: string | null = null;
  brError: string | null = null;
  otConfig: OtConfig | null = null;
  threadRunning: boolean | null = null;
  threadState: string | null = null;
  threadRunOnConnect = false;
  routerTable: OtTableData | null = null;
  childTable: OtTableData | null = null;
  joinerTable: OtTableData | null = null;
  systemInfo: { ipv4: string[]; ipv6: string[] } | null = null;

  constructor(host: ReactiveControllerHost) {
    this.host = host;
    host.addController(this);
  }

  private requestUpdate(): void {
    this.host.requestUpdate();
  }

  /** Xóa dữ liệu OT/Thread khi BR disconnect để UI không hiển thị dữ liệu cũ. */
  private clearBrData(): void {
    this.otConfig = null;
    this.threadRunning = null;
    this.threadState = null;
    this.routerTable = null;
    this.childTable = null;
    this.joinerTable = null;
    this.systemInfo = null;
  }

  hostConnected(): void {
    if (this.socket?.connected) return;

    const socket = io(WS_URL, {
      transports: ["websocket", "polling"],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
      withCredentials: false,
    });

    socket.on("connect", () => {
      this.connected = true;
      this.configError = null;
      this.brError = null;
      socket.emit(EVENTS.CONFIG_GET);
      socket.emit(EVENTS.BR_STATUS);
      socket.emit(EVENTS.OT_GET_THREAD_RUN_ON_CONNECT);
      this.requestUpdate();
    });

    socket.on("disconnect", () => {
      this.connected = false;
      this.brStatus = null;
      this.threadRunning = null;
      this.threadState = null;
      this.systemInfo = null;
      this.requestUpdate();
    });

    socket.on("connect_error", (err: { message: string }) => {
      this.connected = false;
      this.brError = err.message;
      this.requestUpdate();
    });

    socket.on(EVENTS.CONFIG_CURRENT, (data: BrConnectionConfigFromBackend | null) => {
      this.config = data;
      this.configError = null;
      this.requestUpdate();
    });

    socket.on(EVENTS.CONFIG_SAVED, (data: BrConnectionConfigFromBackend) => {
      this.config = data;
      this.configError = null;
      this.requestUpdate();
    });

    socket.on(EVENTS.CONFIG_UPDATED, (data: BrConnectionConfigFromBackend) => {
      this.config = data;
      this.configError = null;
      this.requestUpdate();
    });

    socket.on(EVENTS.CONFIG_ERROR, (data: { error?: string }) => {
      this.configError = data?.error ?? "Config error";
      this.requestUpdate();
    });

    socket.on(EVENTS.BR_STATUS, (data: ConnectionStatus) => {
      this.brStatus = data;
      this.brError = null;
      if (!data?.isConnected) this.clearBrData();
      this.requestUpdate();
    });

    socket.on(EVENTS.BR_CONNECTED, (data: { success: boolean; status?: ConnectionStatus }) => {
      if (data.status) this.brStatus = data.status;
      this.brError = null;
      this.requestUpdate();
    });

    socket.on(EVENTS.BR_DISCONNECTED, () => {
      this.brStatus = this.brStatus ? { ...this.brStatus, isConnected: false } : null;
      this.clearBrData();
      this.requestUpdate();
    });

    socket.on(EVENTS.BR_ERROR, (data: { error?: string }) => {
      this.brError = data?.error ?? "BR connection error";
      this.requestUpdate();
    });

    socket.on(EVENTS.OT_CONFIG, (data: OtConfig) => {
      this.otConfig = data.error ? { error: data.error } : data;
      this.requestUpdate();
    });

    socket.on(EVENTS.OT_THREAD_STATE, (data: OtThreadState) => {
      if (data.error) {
        this.threadRunning = null;
        this.threadState = null;
      } else {
        this.threadRunning = data.running ?? null;
        this.threadState = data.state ?? null;
      }
      this.requestUpdate();
    });

    socket.on(EVENTS.OT_THREAD_RUN_ON_CONNECT, (data: { runOnConnect: boolean }) => {
      this.threadRunOnConnect = !!data.runOnConnect;
      this.requestUpdate();
    });

    socket.on(EVENTS.OT_ROUTER_TABLE, (data: OtTableData) => {
      this.routerTable = data;
      this.requestUpdate();
    });

    socket.on(EVENTS.OT_CHILD_TABLE, (data: OtTableData) => {
      this.childTable = data;
      this.requestUpdate();
    });

    socket.on(EVENTS.OT_JOINER_TABLE, (data: OtTableData) => {
      this.joinerTable = data;
      this.requestUpdate();
    });

    socket.on(EVENTS.SYSTEM_INFO, (data: { ipv4: string[]; ipv6: string[] }) => {
      this.systemInfo = data ?? null;
      this.requestUpdate();
    });

    this.socket = socket;
  }

  hostDisconnected(): void {
    if (this.socket) {
      if (this.socket.connected) this.socket.disconnect();
      this.socket.removeAllListeners();
      this.socket = null;
    }
    this.connected = false;
    this.brStatus = null;
    this.config = null;
  }

  getConfig(): void {
    this.socket?.emit(EVENTS.CONFIG_GET);
  }

  saveConfig(data: { brHost: string; brPort: number; useMdns?: boolean }): void {
    this.socket?.emit(EVENTS.CONFIG_SAVE, data);
  }

  connectBr(): void {
    this.socket?.emit(EVENTS.BR_CONNECT);
  }

  disconnectBr(): void {
    this.socket?.emit(EVENTS.BR_DISCONNECT);
  }

  testBrConnect(data: { brHost: string; brPort: number }): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: "Not connected" });
        return;
      }
      const handler = (result: { success: boolean; error?: string }) => {
        this.socket?.off(EVENTS.BR_TEST_RESULT, handler);
        resolve(result);
      };
      this.socket.once(EVENTS.BR_TEST_RESULT, handler);
      this.socket.emit(EVENTS.BR_TEST, data);
    });
  }

  getOtConfig(): Promise<OtConfig | null> {
    this.otConfig = null;
    this.requestUpdate();
    if (!this.socket) return Promise.resolve(null);
    const socket = this.socket;
    return new Promise((resolve) => {
      const OT_CONFIG_TIMEOUT_MS = 6000;
      const handler = (config: OtConfig) => {
        clearTimeout(timeoutId);
        socket?.off(EVENTS.OT_CONFIG, handler);
        resolve(config);
      };
      socket.once(EVENTS.OT_CONFIG, handler);
      socket.emit(EVENTS.OT_GET_CONFIG);
      const timeoutId = setTimeout(() => {
        socket?.off(EVENTS.OT_CONFIG, handler);
        resolve(null);
      }, OT_CONFIG_TIMEOUT_MS);
    });
  }

  setOtConfig(data: {
    panid?: string;
    channel?: number;
    networkName?: string;
    extendedPanId?: string;
    networkKey?: string;
  }): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: "Not connected" });
        return;
      }
      const handler = (result: { success: boolean; error?: string }) => {
        this.socket?.off(EVENTS.OT_SET_CONFIG_RESULT, handler);
        resolve(result);
      };
      this.socket.once(EVENTS.OT_SET_CONFIG_RESULT, handler);
      this.socket.emit(EVENTS.OT_SET_CONFIG, data);
    });
  }

  getThreadState(): void {
    this.threadRunning = null;
    this.requestUpdate();
    this.socket?.emit(EVENTS.OT_GET_THREAD_STATE);
  }

  setThreadRunning(running: boolean): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: "Not connected" });
        return;
      }
      const handler = (result: { success: boolean; error?: string }) => {
        this.socket?.off(EVENTS.OT_SET_THREAD_RUNNING_RESULT, handler);
        resolve(result);
      };
      this.socket.once(EVENTS.OT_SET_THREAD_RUNNING_RESULT, handler);
      this.socket.emit(EVENTS.OT_SET_THREAD_RUNNING, { running });
    });
  }

  getThreadRunOnConnect(): void {
    this.socket?.emit(EVENTS.OT_GET_THREAD_RUN_ON_CONNECT);
  }

  startThread(): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: "Not connected" });
        return;
      }
      const handler = (result: { success: boolean; error?: string }) => {
        this.socket?.off(EVENTS.OT_START_THREAD_RESULT, handler);
        resolve(result);
      };
      this.socket.once(EVENTS.OT_START_THREAD_RESULT, handler);
      this.socket.emit(EVENTS.OT_START_THREAD);
    });
  }

  stopThread(): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: "Not connected" });
        return;
      }
      const handler = (result: { success: boolean; error?: string }) => {
        this.socket?.off(EVENTS.OT_STOP_THREAD_RESULT, handler);
        resolve(result);
      };
      this.socket.once(EVENTS.OT_STOP_THREAD_RESULT, handler);
      this.socket.emit(EVENTS.OT_STOP_THREAD);
    });
  }

  setThreadRunOnConnect(run: boolean): void {
    this.threadRunOnConnect = run;
    this.requestUpdate();
    this.socket?.emit(EVENTS.OT_SET_THREAD_RUN_ON_CONNECT, { runOnConnect: run });
  }

  getRouterTable(): void {
    this.socket?.emit(EVENTS.OT_GET_ROUTER_TABLE);
  }

  getChildTable(): void {
    this.socket?.emit(EVENTS.OT_GET_CHILD_TABLE);
  }

  getJoinerTable(): void {
    this.socket?.emit(EVENTS.COMMISSIONER_GET_JOINER_TABLE);
  }

  commissionerConnect(
    eui64: string,
    psk: string,
    timeoutSeconds?: number
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: "Not connected" });
        return;
      }
      const handler = (result: { success: boolean; error?: string }) => {
        this.socket?.off(EVENTS.COMMISSIONER_CONNECT_RESULT, handler);
        resolve(result);
      };
      this.socket.once(EVENTS.COMMISSIONER_CONNECT_RESULT, handler);
      this.socket.emit(EVENTS.COMMISSIONER_CONNECT, { eui64, psk, timeout: timeoutSeconds });
    });
  }

  reset(): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: "Not connected" });
        return;
      }
      const handler = (result: { success: boolean; error?: string }) => {
        this.socket?.off(EVENTS.DEVICE_RESET_RESULT, handler);
        resolve(result);
      };
      this.socket.once(EVENTS.DEVICE_RESET_RESULT, handler);
      this.socket.emit(EVENTS.DEVICE_RESET);
    });
  }

  factoryReset(): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve({ success: false, error: "Not connected" });
        return;
      }
      const handler = (result: { success: boolean; error?: string }) => {
        this.socket?.off(EVENTS.DEVICE_FACTORY_RESET_RESULT, handler);
        resolve(result);
      };
      this.socket.once(EVENTS.DEVICE_FACTORY_RESET_RESULT, handler);
      this.socket.emit(EVENTS.DEVICE_FACTORY_RESET);
    });
  }

  onBrData(callback: (data: string) => void): () => void {
    if (!this.socket) return () => {};
    this.socket.on(EVENTS.BR_DATA, callback);
    return () => {
      this.socket?.off(EVENTS.BR_DATA, callback);
    };
  }
}
