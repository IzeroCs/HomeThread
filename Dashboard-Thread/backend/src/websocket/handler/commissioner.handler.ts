/**
 * WebSocket handlers: commissioner connect, get joiner table.
 */

import type { Socket } from "socket.io";
import type { BrManager } from "@communicate";
import { EVENTS } from "shared/src/events";
import { WsOn } from "../ws.decorator";

export class CommissionerHandler {
  constructor(private communicate: BrManager) {}

  @WsOn(EVENTS.COMMISSIONER_GET_JOINER_TABLE)
  async handleCommissionerGetJoinerTable(socket: Socket): Promise<void> {
    if (!this.communicate.getStatus().isConnected) {
      socket.emit(EVENTS.OT_JOINER_TABLE, { error: "BR not connected. Connect to BR first." });
      return;
    }
    const table = this.communicate.getLastJoinerTable();
    socket.emit(EVENTS.OT_JOINER_TABLE, table);
  }

  @WsOn(EVENTS.COMMISSIONER_CONNECT)
  async handleCommissionerConnect(
    socket: Socket,
    data: { eui64?: string; psk?: string; timeout?: number }
  ): Promise<void> {
    if (!this.communicate.getStatus().isConnected) {
      socket.emit(EVENTS.COMMISSIONER_CONNECT_RESULT, { success: false, error: "BR not connected. Connect to BR first." });
      return;
    }
    const eui64 = (data.eui64 ?? "").trim();
    const psk = (data.psk ?? "").trim();
    const timeoutSeconds = typeof data.timeout === "number" ? data.timeout : 60;
    if (!eui64 || !psk) {
      socket.emit(EVENTS.COMMISSIONER_CONNECT_RESULT, { success: false, error: "EUI64 và PSK không được để trống." });
      return;
    }
    try {
      const result = await this.communicate.commissionerJoiner(eui64, psk, timeoutSeconds);
      if (result.ack) {
        socket.emit(EVENTS.COMMISSIONER_CONNECT_RESULT, { success: true });
      } else {
        const errorMap: Record<number, string> = {
          0x02: "Thiết bị chưa sẵn sàng (không phải leader hoặc commissioner chưa active).",
          0x03: "Timeout — firmware không phản hồi kịp.",
          0x04: "Tham số không hợp lệ (EUI64 hoặc PSK sai định dạng).",
        };
        const errorMsg = result.errorCode != null
          ? (errorMap[result.errorCode] ?? `Thất bại (error code: 0x${result.errorCode.toString(16)})`)
          : "Thêm joiner thất bại.";
        socket.emit(EVENTS.COMMISSIONER_CONNECT_RESULT, { success: false, error: errorMsg });
      }
    } catch (error) {
      socket.emit(EVENTS.COMMISSIONER_CONNECT_RESULT, {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}
