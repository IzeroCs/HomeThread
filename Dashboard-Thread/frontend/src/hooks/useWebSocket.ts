/**
 * Hook quản lý kết nối WebSocket tới backend
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type {
  SerialConfigFromBackend,
  SerialStatus,
  CliResponse,
} from "../types/websocket";

// Dev: thử proxy trước, nếu không được thì connect trực tiếp
// Production: set VITE_WS_URL
const WS_URL =
  import.meta.env.VITE_WS_URL ??
  (import.meta.env.DEV ? "http://localhost:3000" : "http://localhost:3000");

export interface UseWebSocketReturn {
  connected: boolean;
  serialStatus: SerialStatus | null;
  config: SerialConfigFromBackend | null;
  configError: string | null;
  serialError: string | null;
  connect: () => void;
  disconnect: () => void;
  getConfig: () => void;
  saveConfig: (data: {
    serialPort: string;
    baudRate: number;
    commandPrefix: string;
  }) => void;
  connectSerial: () => void;
  disconnectSerial: () => void;
  testSerialConnect: (data: {
    serialPort: string;
    baudRate: number;
    commandPrefix: string;
  }) => Promise<{ success: boolean; error?: string }>;
  sendCliCommand: (command: string, id?: string) => void;
  onSerialData: (callback: (data: string) => void) => () => void;
  onCliResponse: (callback: (data: CliResponse) => void) => () => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [serialStatus, setSerialStatus] = useState<SerialStatus | null>(null);
  const [config, setConfig] = useState<SerialConfigFromBackend | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [serialError, setSerialError] = useState<string | null>(null);

  const connect = useCallback(() => {
    if (socketRef.current?.connected) {
      return;
    }

    const socket = io(WS_URL, {
      transports: ["websocket", "polling"], // Cho phép cả websocket và polling
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      withCredentials: false,
    });

    socket.on("connect", () => {
      setConnected(true);
      setConfigError(null);
      setSerialError(null);
      socket.emit("config:get");
      socket.emit("serial:status");
    });

    socket.on("disconnect", (reason) => {
      setConnected(false);
      setSerialStatus(null);
    });

    socket.on("connect_error", (err) => {
      setConnected(false);
      setSerialError(err.message);
    });

    socket.on("config:current", (data: SerialConfigFromBackend | null) => {
      setConfig(data);
      setConfigError(null);
    });

    socket.on("config:saved", (data: SerialConfigFromBackend) => {
      setConfig(data);
      setConfigError(null);
    });

    socket.on("config:updated", (data: SerialConfigFromBackend) => {
      setConfig(data);
      setConfigError(null);
    });

    socket.on("config:error", (data: { error?: string }) => {
      setConfigError(data?.error ?? "Config error");
    });

    socket.on("serial:status", (data: SerialStatus) => {
      setSerialStatus(data);
      setSerialError(null);
    });

    socket.on("serial:connected", (data: { success: boolean; status?: SerialStatus }) => {
      if (data.status) {
        setSerialStatus(data.status);
      }
      setSerialError(null);
    });

    socket.on("serial:disconnected", () => {
      setSerialStatus((prev) =>
        prev ? { ...prev, isConnected: false } : null
      );
    });

    socket.on("serial:error", (data: { error?: string }) => {
      setSerialError(data?.error ?? "Serial error");
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
      setSerialStatus(null);
      setConfig(null);
    }
  }, []);

  const getConfig = useCallback(() => {
    socketRef.current?.emit("config:get");
  }, []);

  const saveConfig = useCallback(
    (data: { serialPort: string; baudRate: number; commandPrefix: string }) => {
      socketRef.current?.emit("config:save", data);
    },
    []
  );

  const connectSerial = useCallback(() => {
    socketRef.current?.emit("serial:connect");
  }, []);

  const disconnectSerial = useCallback(() => {
    socketRef.current?.emit("serial:disconnect");
  }, []);

  const testSerialConnect = useCallback(
    (data: {
      serialPort: string;
      baudRate: number;
      commandPrefix: string;
    }): Promise<{ success: boolean; error?: string }> =>
      new Promise((resolve) => {
        if (!socketRef.current) {
          resolve({ success: false, error: "Not connected" });
          return;
        }
        const handler = (result: { success: boolean; error?: string }) => {
          socketRef.current?.off("serial:test:result", handler);
          resolve(result);
        };
        socketRef.current.once("serial:test:result", handler);
        socketRef.current.emit("serial:test", data);
      }),
    []
  );

  const sendCliCommand = useCallback((command: string, id?: string) => {
    socketRef.current?.emit("cli:command", { command, id });
  }, []);

  const onSerialData = useCallback((callback: (data: string) => void) => {
    if (!socketRef.current) {
      return () => {};
    }
    socketRef.current.on("serial:data", callback);
    return () => {
      socketRef.current?.off("serial:data", callback);
    };
  }, []);

  const onCliResponse = useCallback((callback: (data: CliResponse) => void) => {
    if (!socketRef.current) {
      return () => {};
    }
    socketRef.current.on("cli:response", callback);
    return () => {
      socketRef.current?.off("cli:response", callback);
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
      setSerialStatus(null);
      setConfig(null);
    };
  }, [connect]);

  return {
    connected,
    serialStatus,
    config,
    configError,
    serialError,
    connect,
    disconnect,
    getConfig,
    saveConfig,
    connectSerial,
    disconnectSerial,
    testSerialConnect,
    sendCliCommand,
    onSerialData,
    onCliResponse,
  };
}
