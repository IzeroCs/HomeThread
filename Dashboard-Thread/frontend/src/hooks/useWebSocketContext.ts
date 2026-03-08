/**
 * Hook để sử dụng WebSocket context
 */

import { useContext } from "react";
import { WebSocketContext } from "../contexts/WebSocketContext";
import type { UseWebSocketReturn } from "./useWebSocket";

export function useWebSocketContext(): UseWebSocketReturn {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error("useWebSocketContext must be used within WebSocketProvider");
  }
  return context;
}
