/**
 * WebSocket handlers: device reset, factory reset.
 */

import type { Socket } from "socket.io";
import type { CommunicateManager } from "@communicate";
import { EVENTS } from "shared/src/events";
import { WsOn } from "../ws.decorator";

export class DeviceHandler {
  constructor(private communicate: CommunicateManager) {}

  @WsOn(EVENTS.DEVICE_RESET)
  async handleDeviceReset(socket: Socket): Promise<void> {
    if (!this.communicate.getStatus().isConnected) {
      socket.emit(EVENTS.DEVICE_RESET_RESULT, { success: false, error: "BR not connected." });
      return;
    }
    try {
      const result = await this.communicate.reset();
      if (result.ack) {
        socket.emit(EVENTS.DEVICE_RESET_RESULT, { success: true });
      } else {
        const errorMsg = result.errorCode === 0x02 ? "Not ready" : "Failed to reset device";
        socket.emit(EVENTS.DEVICE_RESET_RESULT, { success: false, error: errorMsg });
      }
    } catch (error) {
      socket.emit(EVENTS.DEVICE_RESET_RESULT, {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  @WsOn(EVENTS.DEVICE_FACTORY_RESET)
  async handleDeviceFactoryReset(socket: Socket): Promise<void> {
    if (!this.communicate.getStatus().isConnected) {
      socket.emit(EVENTS.DEVICE_FACTORY_RESET_RESULT, { success: false, error: "BR not connected." });
      return;
    }
    try {
      const result = await this.communicate.factoryReset();
      if (result.ack) {
        socket.emit(EVENTS.DEVICE_FACTORY_RESET_RESULT, { success: true });
      } else {
        const errorMsg = result.errorCode === 0x02 ? "Not ready" : "Failed to factory reset device";
        socket.emit(EVENTS.DEVICE_FACTORY_RESET_RESULT, { success: false, error: errorMsg });
      }
    } catch (error) {
      socket.emit(EVENTS.DEVICE_FACTORY_RESET_RESULT, {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}
