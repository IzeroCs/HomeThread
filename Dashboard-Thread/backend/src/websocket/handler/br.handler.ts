/**
 * WebSocket handlers: BR status, connect, disconnect, test.
 */

import type { Server } from "socket.io";
import type { Socket } from "socket.io";
import type { BrManager } from "@communicate";
import { EVENTS } from "shared/src/events";
import { validateBrConnectionConfig } from "shared/src/validation";
import { WsOn } from "../ws.decorator";

export class BrHandler {
  constructor(
    private io: Server,
    private communicate: BrManager
  ) {}

  @WsOn(EVENTS.BR_STATUS)
  sendBrStatus(socket: Socket): void {
    socket.emit(EVENTS.BR_STATUS, this.communicate.getStatus());
  }

  @WsOn(EVENTS.BR_CONNECT)
  async handleBrConnect(socket: Socket): Promise<void> {
    try {
      await this.communicate.connect();
      socket.emit(EVENTS.BR_CONNECTED, { success: true, status: this.communicate.getStatus() });
      this.io.emit(EVENTS.BR_STATUS, this.communicate.getStatus());
    } catch (error) {
      socket.emit(EVENTS.BR_ERROR, {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  @WsOn(EVENTS.BR_DISCONNECT)
  async handleBrDisconnect(socket: Socket): Promise<void> {
    try {
      await this.communicate.disconnect();
      socket.emit(EVENTS.BR_DISCONNECTED, { success: true });
      this.io.emit(EVENTS.BR_STATUS, this.communicate.getStatus());
    } catch (error) {
      socket.emit(EVENTS.BR_ERROR, {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  @WsOn(EVENTS.BR_TEST)
  async handleBrTest(
    socket: Socket,
    data: { brHost: string; brPort: number }
  ): Promise<void> {
    const err = validateBrConnectionConfig(data);
    if (err) {
      socket.emit(EVENTS.BR_TEST_RESULT, { success: false, error: err });
      return;
    }
    const host = data.brHost.trim();
    const port = Number(data.brPort);
    try {
      const result = await this.communicate.testConnection(host, port);
      socket.emit(EVENTS.BR_TEST_RESULT, result);
    } catch (error) {
      socket.emit(EVENTS.BR_TEST_RESULT, {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}
