/**
 * Context cung cấp WebSocket connection cho toàn bộ app
 */

import { createContext, ReactNode } from "react";
import { useWebSocket, UseWebSocketReturn } from "@shared/hooks/use-websocket.hook";

export const WebSocketContext = createContext<UseWebSocketReturn | null>(null);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const ws = useWebSocket();
  return (
    <WebSocketContext.Provider value={ws}>
      {children}
    </WebSocketContext.Provider>
  );
}
