/**
 * Hook để sử dụng WebSocket context
 */

import { useContext } from "react";
import { WebSocketContext } from "@shared/contexts/websocket.context";
import type { UseWebSocketReturn } from "@shared/hooks/use-websocket.hook";

export function useWebSocketContext(): UseWebSocketReturn {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error("useWebSocketContext must be used within WebSocketProvider");
  }
  return context;
}
