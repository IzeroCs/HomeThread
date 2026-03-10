/**
 * WebSocket handlers: SRP register.
 */

import type { Socket } from "socket.io";
import type { CommunicateManager } from "@communicate";
import { EVENTS } from "shared/src/events";
import { WsOn } from "../ws.decorator";

export class SrpHandler {
  constructor(private communicate: CommunicateManager) {}

  @WsOn(EVENTS.SRP_REGISTER)
  async handleSrpRegister(
    socket: Socket,
    data: { hostname?: string; backendIPv6: string; port?: number }
  ): Promise<void> {
    if (!this.communicate.getStatus().isConnected) {
      socket.emit(EVENTS.SRP_REGISTER_RESULT, { success: false, error: "BR not connected. Connect to BR first." });
      return;
    }
    const backendIPv6 = (data.backendIPv6 ?? "").trim();
    if (!backendIPv6) {
      socket.emit(EVENTS.SRP_REGISTER_RESULT, { success: false, error: "backendIPv6 is required." });
      return;
    }
    const hostname = (data.hostname ?? "dashboard").trim() || "dashboard";
    const port = typeof data.port === "number" ? data.port : 5683;
    try {
      const result = await this.communicate.srpRegister(hostname, backendIPv6, port);
      if (result.ack) {
        socket.emit(EVENTS.SRP_REGISTER_RESULT, { success: true });
      } else {
        const errorMap: Record<number, string> = {
          0x02: "OT chưa sẵn sàng (SRP client/server chưa up hoặc lock timeout).",
          0x03: "Lock timeout.",
          0x04: "Payload sai (hostname/len/port hoặc tổng độ dài).",
        };
        const errorMsg =
          result.errorCode != null
            ? errorMap[result.errorCode] ?? `Thất bại (error code: 0x${result.errorCode.toString(16)})`
            : "SRP register thất bại.";
        socket.emit(EVENTS.SRP_REGISTER_RESULT, { success: false, error: errorMsg });
      }
    } catch (error) {
      socket.emit(EVENTS.SRP_REGISTER_RESULT, {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}
