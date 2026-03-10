/**
 * Hook quản lý kết nối WebSocket tới backend
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type {
  BrConnectionConfigFromBackend,
  ConnectionStatus,
  OtConfig,
  OtThreadState,
  OtTableData,
} from "@shared/types/websocket.type";
import { EVENTS } from "shared/src/events";

// Dev: dùng cùng origin (vd. http://<IP>:5173) để truy cập từ LAN qua proxy
// Production: set VITE_WS_URL hoặc dùng cùng host
const WS_URL =
  import.meta.env.VITE_WS_URL ??
  (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");

export interface UseWebSocketReturn {
  connected: boolean;
  brStatus: ConnectionStatus | null;
  config: BrConnectionConfigFromBackend | null;
  configError: string | null;
  brError: string | null;
  connect: () => void;
  disconnect: () => void;
  getConfig: () => void;
  saveConfig: (data: { brHost: string; brPort: number; useMdns?: boolean }) => void;
  connectBr: () => void;
  disconnectBr: () => void;
  testBrConnect: (data: { brHost: string; brPort: number }) => Promise<{ success: boolean; error?: string }>;
  otConfig: OtConfig | null;
  /** Gửi request lấy OT config từ thiết bị; resolve khi nhận OT_CONFIG hoặc sau timeout 6s. */
  getOtConfig: () => Promise<OtConfig | null>;
  setOtConfig: (data: { panid?: string; channel?: number; networkName?: string; extendedPanId?: string; networkKey?: string }) => Promise<{ success: boolean; error?: string }>;
  threadRunning: boolean | null;
  /** Raw state: leader, router, child, detached, disabled — dùng để đổi màu dot Sidebar */
  threadState: string | null;
  getThreadState: () => void;
  setThreadRunning: (running: boolean) => Promise<{ success: boolean; error?: string }>;
  startThread: () => Promise<{ success: boolean; error?: string }>;
  stopThread: () => Promise<{ success: boolean; error?: string }>;
  threadRunOnConnect: boolean;
  getThreadRunOnConnect: () => void;
  setThreadRunOnConnect: (run: boolean) => void;
  routerTable: OtTableData | null;
  childTable: OtTableData | null;
  getRouterTable: () => void;
  getChildTable: () => void;
  joinerTable: OtTableData | null;
  getJoinerTable: () => void;
  commissionerConnect: (eui64: string, psk: string, timeoutSeconds?: number) => Promise<{ success: boolean; error?: string }>;
  onBrData: (callback: (data: string) => void) => () => void;
  /** Backend system info (IPv4/IPv6) for Status → System section. */
  systemInfo: { ipv4: string[]; ipv6: string[] } | null;
  reset: () => Promise<{ success: boolean; error?: string }>;
  factoryReset: () => Promise<{ success: boolean; error?: string }>;
}

export function useWebSocket(): UseWebSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [brStatus, setBrStatus] = useState<ConnectionStatus | null>(null);
  const [config, setConfig] = useState<BrConnectionConfigFromBackend | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [brError, setBrError] = useState<string | null>(null);
  const [otConfig, setOtConfigState] = useState<OtConfig | null>(null);
  const [threadRunning, setThreadRunningState] = useState<boolean | null>(null);
  const [threadState, setThreadState] = useState<string | null>(null);
  const [threadRunOnConnect, setThreadRunOnConnectState] = useState<boolean>(false);
  const [routerTable, setRouterTable] = useState<OtTableData | null>(null);
  const [childTable, setChildTable] = useState<OtTableData | null>(null);
  const [joinerTable, setJoinerTable] = useState<OtTableData | null>(null);
  const [systemInfo, setSystemInfo] = useState<{ ipv4: string[]; ipv6: string[] } | null>(null);

  const connect = useCallback(() => {
    if (socketRef.current?.connected) {
      return;
    }

    const socket = io(WS_URL, {
      transports: ["websocket", "polling"], // Cho phép cả websocket và polling
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
      withCredentials: false,
    });

    socket.on("connect", () => {
      setConnected(true);
      setConfigError(null);
      setBrError(null);
      socket.emit(EVENTS.CONFIG_GET);
      socket.emit(EVENTS.BR_STATUS);
      socket.emit(EVENTS.OT_GET_THREAD_RUN_ON_CONNECT);
    });

    socket.on("disconnect", () => {
      setConnected(false);
      setBrStatus(null);
      setThreadRunningState(null);
      setThreadState(null);
      setSystemInfo(null);
    });

    socket.on("connect_error", (err) => {
      setConnected(false);
      setBrError(err.message);
    });

    socket.on(EVENTS.CONFIG_CURRENT, (data: BrConnectionConfigFromBackend | null) => {
      setConfig(data);
      setConfigError(null);
    });

    socket.on(EVENTS.CONFIG_SAVED, (data: BrConnectionConfigFromBackend) => {
      setConfig(data);
      setConfigError(null);
    });

    socket.on(EVENTS.CONFIG_UPDATED, (data: BrConnectionConfigFromBackend) => {
      setConfig(data);
      setConfigError(null);
    });

    socket.on(EVENTS.CONFIG_ERROR, (data: { error?: string }) => {
      setConfigError(data?.error ?? "Config error");
    });

    socket.on(EVENTS.BR_STATUS, (data: ConnectionStatus) => {
      setBrStatus(data);
      setBrError(null);
    });

    socket.on(EVENTS.BR_CONNECTED, (data: { success: boolean; status?: ConnectionStatus }) => {
      if (data.status) {
        setBrStatus(data.status);
      }
      setBrError(null);
    });

    socket.on(EVENTS.BR_DISCONNECTED, () => {
      setBrStatus((prev) =>
        prev ? { ...prev, isConnected: false } : null
      );
    });

    socket.on(EVENTS.BR_ERROR, (data: { error?: string }) => {
      setBrError(data?.error ?? "BR connection error");
    });

    socket.on(EVENTS.OT_CONFIG, (data: OtConfig) => {
      setOtConfigState(data.error ? { error: data.error } : data);
    });

    socket.on(EVENTS.OT_THREAD_STATE, (data: OtThreadState) => {
      if (data.error) {
        setThreadRunningState(null);
        setThreadState(null);
      } else {
        setThreadRunningState(data.running ?? null);
        setThreadState(data.state ?? null);
      }
    });

    socket.on(EVENTS.OT_THREAD_RUN_ON_CONNECT, (data: { runOnConnect: boolean }) => {
      setThreadRunOnConnectState(!!data.runOnConnect);
    });

    socket.on(EVENTS.OT_ROUTER_TABLE, (data: OtTableData) => {
      setRouterTable(data);
    });

    socket.on(EVENTS.OT_CHILD_TABLE, (data: OtTableData) => {
      setChildTable(data);
    });

    socket.on(EVENTS.OT_JOINER_TABLE, (data: OtTableData) => {
      setJoinerTable(data);
    });

    socket.on(EVENTS.SYSTEM_INFO, (data: { ipv4: string[]; ipv6: string[] }) => {
      setSystemInfo(data ?? null);
    });

    socketRef.current = socket;
  }, []);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      // Kiểm tra socket đã connected chưa trước khi disconnect
      if (socketRef.current.connected) {
        socketRef.current.disconnect();
      }
      socketRef.current.removeAllListeners();
      socketRef.current = null;
      setConnected(false);
      setBrStatus(null);
      setConfig(null);
    }
  }, []);

  const getConfig = useCallback(() => {
    socketRef.current?.emit(EVENTS.CONFIG_GET);
  }, []);

  const saveConfig = useCallback(
    (data: { brHost: string; brPort: number; useMdns?: boolean }) => {
      socketRef.current?.emit(EVENTS.CONFIG_SAVE, data);
    },
    []
  );

  const connectBr = useCallback(() => {
    socketRef.current?.emit(EVENTS.BR_CONNECT);
  }, []);

  const disconnectBr = useCallback(() => {
    socketRef.current?.emit(EVENTS.BR_DISCONNECT);
  }, []);

  const testBrConnect = useCallback(
    (data: { brHost: string; brPort: number }): Promise<{ success: boolean; error?: string }> =>
      new Promise((resolve) => {
        if (!socketRef.current) {
          resolve({ success: false, error: "Not connected" });
          return;
        }
        const handler = (result: { success: boolean; error?: string }) => {
          socketRef.current?.off(EVENTS.BR_TEST_RESULT, handler);
          resolve(result);
        };
        socketRef.current.once(EVENTS.BR_TEST_RESULT, handler);
        socketRef.current.emit(EVENTS.BR_TEST, data);
      }),
    []
  );

  const getOtConfig = useCallback((): Promise<OtConfig | null> => {
    setOtConfigState(null);
    if (!socketRef.current) {
      return Promise.resolve(null);
    }
    const socket = socketRef.current;
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
  }, []);

  const setOtConfig = useCallback(
    (data: { panid?: string; channel?: number; networkName?: string; extendedPanId?: string; networkKey?: string }): Promise<{ success: boolean; error?: string }> =>
      new Promise((resolve) => {
        if (!socketRef.current) {
          resolve({ success: false, error: "Not connected" });
          return;
        }
        const handler = (result: { success: boolean; error?: string }) => {
          socketRef.current?.off(EVENTS.OT_SET_CONFIG_RESULT, handler);
          resolve(result);
        };
        socketRef.current.once(EVENTS.OT_SET_CONFIG_RESULT, handler);
        socketRef.current.emit(EVENTS.OT_SET_CONFIG, data);
      }),
    []
  );

  const getThreadState = useCallback(() => {
    setThreadRunningState(null);
    socketRef.current?.emit(EVENTS.OT_GET_THREAD_STATE);
  }, []);

  const setThreadRunning = useCallback(
    (running: boolean): Promise<{ success: boolean; error?: string }> =>
      new Promise((resolve) => {
        if (!socketRef.current) {
          resolve({ success: false, error: "Not connected" });
          return;
        }
        const handler = (result: { success: boolean; error?: string }) => {
          socketRef.current?.off(EVENTS.OT_SET_THREAD_RUNNING_RESULT, handler);
          resolve(result);
        };
        socketRef.current.once(EVENTS.OT_SET_THREAD_RUNNING_RESULT, handler);
        socketRef.current.emit(EVENTS.OT_SET_THREAD_RUNNING, { running });
      }),
    []
  );

  const getThreadRunOnConnect = useCallback(() => {
    socketRef.current?.emit(EVENTS.OT_GET_THREAD_RUN_ON_CONNECT);
  }, []);

  const startThread = useCallback(
    (): Promise<{ success: boolean; error?: string }> =>
      new Promise((resolve) => {
        if (!socketRef.current) {
          resolve({ success: false, error: "Not connected" });
          return;
        }
        const handler = (result: { success: boolean; error?: string }) => {
          socketRef.current?.off(EVENTS.OT_START_THREAD_RESULT, handler);
          resolve(result);
        };
        socketRef.current.once(EVENTS.OT_START_THREAD_RESULT, handler);
        socketRef.current.emit(EVENTS.OT_START_THREAD);
      }),
    []
  );

  const stopThread = useCallback(
    (): Promise<{ success: boolean; error?: string }> =>
      new Promise((resolve) => {
        if (!socketRef.current) {
          resolve({ success: false, error: "Not connected" });
          return;
        }
        const handler = (result: { success: boolean; error?: string }) => {
          socketRef.current?.off(EVENTS.OT_STOP_THREAD_RESULT, handler);
          resolve(result);
        };
        socketRef.current.once(EVENTS.OT_STOP_THREAD_RESULT, handler);
        socketRef.current.emit(EVENTS.OT_STOP_THREAD);
      }),
    []
  );

  const setThreadRunOnConnect = useCallback((run: boolean) => {
    setThreadRunOnConnectState(run);
    socketRef.current?.emit(EVENTS.OT_SET_THREAD_RUN_ON_CONNECT, { runOnConnect: run });
  }, []);

  const getRouterTable = useCallback(() => {
    socketRef.current?.emit(EVENTS.OT_GET_ROUTER_TABLE);
  }, []);

  const getChildTable = useCallback(() => {
    socketRef.current?.emit(EVENTS.OT_GET_CHILD_TABLE);
  }, []);

  const getJoinerTable = useCallback(() => {
    socketRef.current?.emit(EVENTS.COMMISSIONER_GET_JOINER_TABLE);
  }, []);

  const commissionerConnect = useCallback(
    (eui64: string, psk: string, timeoutSeconds?: number): Promise<{ success: boolean; error?: string }> =>
      new Promise((resolve) => {
        if (!socketRef.current) {
          resolve({ success: false, error: "Not connected" });
          return;
        }
        const handler = (result: { success: boolean; error?: string }) => {
          socketRef.current?.off(EVENTS.COMMISSIONER_CONNECT_RESULT, handler);
          resolve(result);
        };
        socketRef.current.once(EVENTS.COMMISSIONER_CONNECT_RESULT, handler);
        socketRef.current.emit(EVENTS.COMMISSIONER_CONNECT, { eui64, psk, timeout: timeoutSeconds });
      }),
    []
  );

  const reset = useCallback(
    (): Promise<{ success: boolean; error?: string }> =>
      new Promise((resolve) => {
        if (!socketRef.current) {
          resolve({ success: false, error: "Not connected" });
          return;
        }
        const handler = (result: { success: boolean; error?: string }) => {
          socketRef.current?.off(EVENTS.DEVICE_RESET_RESULT, handler);
          resolve(result);
        };
        socketRef.current.once(EVENTS.DEVICE_RESET_RESULT, handler);
        socketRef.current.emit(EVENTS.DEVICE_RESET);
      }),
    []
  );

  const factoryReset = useCallback(
    (): Promise<{ success: boolean; error?: string }> =>
      new Promise((resolve) => {
        if (!socketRef.current) {
          resolve({ success: false, error: "Not connected" });
          return;
        }
        const handler = (result: { success: boolean; error?: string }) => {
          socketRef.current?.off(EVENTS.DEVICE_FACTORY_RESET_RESULT, handler);
          resolve(result);
        };
        socketRef.current.once(EVENTS.DEVICE_FACTORY_RESET_RESULT, handler);
        socketRef.current.emit(EVENTS.DEVICE_FACTORY_RESET);
      }),
    []
  );

  const onBrData = useCallback((callback: (data: string) => void) => {
    if (!socketRef.current) {
      return () => {};
    }
    socketRef.current.on(EVENTS.BR_DATA, callback);
    return () => {
      socketRef.current?.off(EVENTS.BR_DATA, callback);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      // Cleanup khi component unmount
      if (socketRef.current) {
        if (socketRef.current.connected) {
          socketRef.current.disconnect();
        }
        socketRef.current.removeAllListeners();
        socketRef.current = null;
      }
      setConnected(false);
      setBrStatus(null);
      setConfig(null);
    };
  }, [connect]);

  return {
    connected,
    brStatus,
    config,
    configError,
    brError,
    connect,
    disconnect,
    getConfig,
    saveConfig,
    connectBr,
    disconnectBr,
    testBrConnect,
    otConfig,
    getOtConfig,
    setOtConfig,
    threadRunning,
    threadState,
    getThreadState,
    setThreadRunning,
    startThread,
    stopThread,
    threadRunOnConnect,
    getThreadRunOnConnect,
    setThreadRunOnConnect,
    routerTable,
    childTable,
    getRouterTable,
    getChildTable,
    joinerTable,
    getJoinerTable,
    commissionerConnect,
    onBrData,
    systemInfo,
    reset,
    factoryReset,
  };
}
