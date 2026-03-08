/**
 * Context cung cấp WebSocket connection cho toàn bộ app
 */

import { createContext, ReactNode } from "react";
import { useWebSocket, UseWebSocketReturn } from "../hooks/useWebSocket";

export const WebSocketContext = createContext<UseWebSocketReturn | null>(null);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const ws = useWebSocket();
  return (
    <WebSocketContext.Provider value={ws}>
      {children}
    </WebSocketContext.Provider>
  );
}
