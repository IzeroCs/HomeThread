/**
 * WebSocket handlers: OpenThread / Thread — config, state, start/stop, run-on-connect, router/child table.
 */

import type { Socket } from "socket.io";
import type { CommunicateManager } from "@communicate";
import { AppSettingsService } from "@settings/app-settings.service";
import { EVENTS } from "shared/src/events";
import { validateOtSetConfig } from "shared/src/validation";
import { WsOn } from "../ws.decorator";

export class ThreadHandler {
  constructor(
    private communicate: CommunicateManager,
    private appSettingsService: AppSettingsService
  ) {}

  @WsOn(EVENTS.OT_GET_CONFIG)
  async handleOtGetConfig(socket: Socket): Promise<void> {
    const status = this.communicate.getStatus();
    if (!status.isConnected) {
      socket.emit(EVENTS.OT_CONFIG, { error: "BR not connected. Connect to BR first." });
      return;
    }
    try {
      const config = await this.communicate.fetchOtConfig();
      socket.emit(EVENTS.OT_CONFIG, config);
    } catch (error) {
      socket.emit(EVENTS.OT_CONFIG, { error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  @WsOn(EVENTS.OT_SET_CONFIG)
  async handleOtSetConfig(
    socket: Socket,
    data: { panid?: string; channel?: number; networkName?: string; extendedPanId?: string; networkKey?: string }
  ): Promise<void> {
    if (!this.communicate.getStatus().isConnected) {
      socket.emit(EVENTS.OT_SET_CONFIG_RESULT, { success: false, error: "BR not connected." });
      return;
    }
    const err = validateOtSetConfig(data);
    if (err) {
      socket.emit(EVENTS.OT_SET_CONFIG_RESULT, { success: false, error: err });
      return;
    }

    const results: Array<{ field: string; success: boolean; error?: string }> = [];

    try {
      if (data.panid != null && data.panid !== "") {
        const panidResult = await this.communicate.setPanid(data.panid);
        if (panidResult.ack) {
          results.push({ field: "PAN ID", success: true });
        } else {
          const errorMsg = panidResult.errorCode === 0x04 ? "Invalid PAN ID" : "Failed to set PAN ID";
          results.push({ field: "PAN ID", success: false, error: errorMsg });
        }
      }

      if (data.channel != null) {
        const channelResult = await this.communicate.setChannel(data.channel);
        if (channelResult.ack) {
          results.push({ field: "Channel", success: true });
        } else {
          const errorMsg = channelResult.errorCode === 0x04 ? "Invalid Channel" : "Failed to set Channel";
          results.push({ field: "Channel", success: false, error: errorMsg });
        }
      }

      if (data.networkName != null && data.networkName !== "") {
        const networkNameResult = await this.communicate.setNetworkName(data.networkName);
        if (networkNameResult.ack) {
          results.push({ field: "Network Name", success: true });
        } else {
          const errorMsg = networkNameResult.errorCode === 0x04 ? "Invalid Network Name" : "Failed to set Network Name";
          results.push({ field: "Network Name", success: false, error: errorMsg });
        }
      }

      if (data.extendedPanId != null && data.extendedPanId !== "") {
        const extendedPanIdResult = await this.communicate.setExtendedPanid(data.extendedPanId);
        if (extendedPanIdResult.ack) {
          results.push({ field: "Extended PAN ID", success: true });
        } else {
          const errorMsg = extendedPanIdResult.errorCode === 0x04 ? "Invalid Extended PAN ID" : "Failed to set Extended PAN ID";
          results.push({ field: "Extended PAN ID", success: false, error: errorMsg });
        }
      }

      if (data.networkKey != null && data.networkKey !== "") {
        const networkKeyResult = await this.communicate.setNetworkKey(data.networkKey);
        if (networkKeyResult.ack) {
          results.push({ field: "Network Key", success: true });
        } else {
          const errorMsg = networkKeyResult.errorCode === 0x04 ? "Invalid Network Key" : "Failed to set Network Key";
          results.push({ field: "Network Key", success: false, error: errorMsg });
        }
      }

      const failedResults = results.filter((r) => !r.success);
      if (failedResults.length > 0) {
        const firstError = failedResults[0];
        socket.emit(EVENTS.OT_SET_CONFIG_RESULT, {
          success: false,
          error: `${firstError.field}: ${firstError.error ?? "Failed"}`,
        });
      } else if (results.length > 0) {
        await this.communicate.fetchOtConfig();
        socket.emit(EVENTS.OT_SET_CONFIG_RESULT, { success: true });
      } else {
        socket.emit(EVENTS.OT_SET_CONFIG_RESULT, { success: false, error: "No fields to set" });
      }
    } catch (error) {
      socket.emit(EVENTS.OT_SET_CONFIG_RESULT, {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  @WsOn(EVENTS.OT_GET_THREAD_STATE)
  async handleOtGetThreadState(socket: Socket): Promise<void> {
    if (!this.communicate.getStatus().isConnected) {
      socket.emit(EVENTS.OT_THREAD_STATE, { error: "BR not connected. Connect to BR first." });
      return;
    }
    const state = this.communicate.getLastThreadState();
    if (state != null) {
      socket.emit(EVENTS.OT_THREAD_STATE, state);
      return;
    }
    socket.emit(EVENTS.OT_THREAD_STATE, { error: "Use frame protocol." });
  }

  @WsOn(EVENTS.OT_SET_THREAD_RUNNING)
  async handleOtSetThreadRunning(socket: Socket, _data: { running: boolean }): Promise<void> {
    if (!this.communicate.getStatus().isConnected) {
      socket.emit(EVENTS.OT_SET_THREAD_RUNNING_RESULT, { success: false, error: "BR not connected." });
      return;
    }
    socket.emit(EVENTS.OT_SET_THREAD_RUNNING_RESULT, { success: false, error: "Use frame protocol." });
  }

  @WsOn(EVENTS.OT_START_THREAD)
  async handleOtStartThread(socket: Socket): Promise<void> {
    if (!this.communicate.getStatus().isConnected) {
      socket.emit(EVENTS.OT_START_THREAD_RESULT, { success: false, error: "BR not connected." });
      return;
    }
    try {
      const result = await this.communicate.startThread();
      if (result.ack) {
        socket.emit(EVENTS.OT_START_THREAD_RESULT, { success: true });
      } else {
        const errorMsg = result.errorCode === 0x04 ? "Invalid parameter" : result.errorCode === 0x02 ? "Not ready" : "Failed to start Thread";
        socket.emit(EVENTS.OT_START_THREAD_RESULT, { success: false, error: errorMsg });
      }
    } catch (error) {
      socket.emit(EVENTS.OT_START_THREAD_RESULT, {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  @WsOn(EVENTS.OT_STOP_THREAD)
  async handleOtStopThread(socket: Socket): Promise<void> {
    if (!this.communicate.getStatus().isConnected) {
      socket.emit(EVENTS.OT_STOP_THREAD_RESULT, { success: false, error: "BR not connected." });
      return;
    }
    try {
      const result = await this.communicate.stopThread();
      if (result.ack) {
        socket.emit(EVENTS.OT_STOP_THREAD_RESULT, { success: true });
      } else {
        const errorMsg = result.errorCode === 0x04 ? "Invalid parameter" : result.errorCode === 0x02 ? "Not ready" : "Failed to stop Thread";
        socket.emit(EVENTS.OT_STOP_THREAD_RESULT, { success: false, error: errorMsg });
      }
    } catch (error) {
      socket.emit(EVENTS.OT_STOP_THREAD_RESULT, {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  @WsOn(EVENTS.OT_GET_THREAD_RUN_ON_CONNECT)
  handleGetThreadRunOnConnect(socket: Socket): void {
    socket.emit(EVENTS.OT_THREAD_RUN_ON_CONNECT, { runOnConnect: this.appSettingsService.getThreadRunOnConnect() });
  }

  @WsOn(EVENTS.OT_SET_THREAD_RUN_ON_CONNECT)
  handleSetThreadRunOnConnect(socket: Socket, data?: { runOnConnect?: boolean }): void {
    const runOnConnect = !!data?.runOnConnect;
    this.appSettingsService.setThreadRunOnConnect(runOnConnect);
    socket.emit(EVENTS.OT_THREAD_RUN_ON_CONNECT, { runOnConnect });
  }

  @WsOn(EVENTS.OT_GET_ROUTER_TABLE)
  async handleOtGetRouterTable(socket: Socket): Promise<void> {
    if (!this.communicate.getStatus().isConnected) {
      socket.emit(EVENTS.OT_ROUTER_TABLE, { error: "BR not connected. Connect to BR first." });
      return;
    }
    const table = this.communicate.getLastRouterTable();
    socket.emit(EVENTS.OT_ROUTER_TABLE, table ?? { error: "No data." });
  }

  @WsOn(EVENTS.OT_GET_CHILD_TABLE)
  async handleOtGetChildTable(socket: Socket): Promise<void> {
    if (!this.communicate.getStatus().isConnected) {
      socket.emit(EVENTS.OT_CHILD_TABLE, { error: "BR not connected. Connect to BR first." });
      return;
    }
    const table = this.communicate.getLastChildTable();
    socket.emit(EVENTS.OT_CHILD_TABLE, table ?? { error: "No data." });
  }
}
