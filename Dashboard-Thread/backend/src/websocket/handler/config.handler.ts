/**
 * WebSocket handlers: config get/save/update.
 */

import type { Server } from "socket.io";
import type { Socket } from "socket.io";
import type { BrConnectionConfigService, CommunicateManager } from "@communicate";
import { getBackendAddresses } from "@utils/ipv6.util";
import { EVENTS } from "shared/src/events";
import { validateBrConnectionConfig } from "shared/src/validation";
import { WsOn } from "../ws.decorator";

export class ConfigHandler {
  constructor(
    private io: Server,
    private brConnectionConfigService: BrConnectionConfigService,
    private communicate: CommunicateManager
  ) {}

  @WsOn(EVENTS.CONFIG_GET)
  sendCurrentConfig(socket: Socket): void {
    socket.emit(EVENTS.CONFIG_CURRENT, this.brConnectionConfigService.getLatest());
    socket.emit(EVENTS.SYSTEM_INFO, getBackendAddresses());
  }

  @WsOn(EVENTS.CONFIG_SAVE)
  async handleConfigSave(
    socket: Socket,
    data: { brHost: string; brPort: number; useMdns?: boolean }
  ): Promise<void> {
    const err = validateBrConnectionConfig(data);
    if (err) {
      socket.emit(EVENTS.CONFIG_ERROR, { error: err });
      return;
    }
    try {
      await this.communicate.resetTransport();
      const config = this.brConnectionConfigService.saveOrUpdate({
        brHost: data.brHost.trim(),
        brPort: Number(data.brPort),
        useMdns: data.useMdns,
      });
      socket.emit(EVENTS.CONFIG_SAVED, config);
      this.io.emit(EVENTS.CONFIG_CURRENT, config);
      await this.communicate.connect();
      socket.emit(EVENTS.BR_STATUS, this.communicate.getStatus());
    } catch (error) {
      socket.emit(EVENTS.CONFIG_ERROR, { error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  @WsOn(EVENTS.CONFIG_UPDATE)
  async handleConfigUpdate(
    socket: Socket,
    data: { id?: number; brHost?: string; brPort?: number; useMdns?: boolean }
  ): Promise<void> {
    const err = validateBrConnectionConfig(data);
    if (err) {
      socket.emit(EVENTS.CONFIG_ERROR, { error: err });
      return;
    }
    try {
      const updates: { brHost?: string; brPort?: number; useMdns?: boolean } = {};
      if (data.brHost !== undefined) updates.brHost = data.brHost.trim();
      if (data.brPort !== undefined) updates.brPort = Number(data.brPort);
      if (data.useMdns !== undefined) updates.useMdns = data.useMdns;
      const config = this.brConnectionConfigService.update(data.id ?? 0, updates);
      if (config) {
        await this.communicate.resetTransport();
        socket.emit(EVENTS.CONFIG_UPDATED, config);
        this.io.emit(EVENTS.CONFIG_CURRENT, config);
      } else {
        socket.emit(EVENTS.CONFIG_ERROR, { error: "Config not found" });
      }
    } catch (error) {
      socket.emit(EVENTS.CONFIG_ERROR, { error: error instanceof Error ? error.message : "Unknown error" });
    }
  }
}
