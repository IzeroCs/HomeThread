/**
 * WebSocket Server - Chỉ emit dữ liệu tới frontend.
 * Dữ liệu và khởi tạo giao tiếp nằm ở CommunicateManager; lấy qua getter.
 */

import { Server, Socket } from "socket.io";
import type { SerialConfigService, CommunicateManager } from "../communicate";
import { AppSettingsService } from "../services/AppSettingsService";

export class WebSocketServer {
  private io: Server;
  private serialConfigService: SerialConfigService;
  private appSettingsService: AppSettingsService;
  private communicate: CommunicateManager;

  constructor(
    io: Server,
    serialConfigService: SerialConfigService,
    appSettingsService: AppSettingsService,
    communicate: CommunicateManager
  ) {
    this.io = io;
    this.serialConfigService = serialConfigService;
    this.appSettingsService = appSettingsService;
    this.communicate = communicate;
    this.setupEventHandlers();
  }

  /** Gọi khi server khởi động: nếu đã có config thì tự kết nối serial (ở main). */
  async connectSerialIfConfigured(): Promise<void> {
    await this.communicate.connectIfConfigured();
  }

  async close(): Promise<void> {
    await this.communicate.close();
  }

  private setupEventHandlers(): void {
    this.io.on("connection", (socket: Socket) => {
      console.log(`[WS] Client connected: ${socket.id}`);

      this.sendCurrentConfig(socket);
      this.sendSerialStatus(socket);

      const lastThreadState = this.communicate.getLastThreadState();
      if (lastThreadState != null) socket.emit("ot:threadState", lastThreadState);
      const lastOtConfig = this.communicate.getLastOtConfig();
      if (lastOtConfig != null) socket.emit("ot:config", lastOtConfig);
      const lastRouterTable = this.communicate.getLastRouterTable();
      if (lastRouterTable != null) socket.emit("ot:routerTable", lastRouterTable);
      const lastChildTable = this.communicate.getLastChildTable();
      if (lastChildTable != null) socket.emit("ot:childTable", lastChildTable);
      const lastJoinerTable = this.communicate.getLastJoinerTable();
      if (lastJoinerTable != null) socket.emit("commissioner:joinerTable", lastJoinerTable);

      socket.on("config:get", () => this.sendCurrentConfig(socket));
      socket.on("config:save", (data: { serialPort: string; baudRate: number; commandPrefix?: string }) =>
        this.handleConfigSave(socket, data)
      );
      socket.on("config:update", (data: { id: number; serialPort?: string; baudRate?: number; commandPrefix?: string }) =>
        this.handleConfigUpdate(socket, data)
      );

      socket.on("serial:connect", () => this.handleSerialConnect(socket));
      socket.on("serial:disconnect", () => this.handleSerialDisconnect(socket));
      socket.on("serial:status", () => this.sendSerialStatus(socket));
      socket.on("serial:test", (data: { serialPort: string; baudRate: number; commandPrefix?: string }) =>
        this.handleSerialTest(socket, data)
      );

      socket.on("ot:getConfig", () => this.handleOtGetConfig(socket));
      socket.on("ot:setConfig", (data: { panid?: string; channel?: number; networkName?: string }) =>
        this.handleOtSetConfig(socket, data)
      );
      socket.on("ot:getThreadState", () => this.handleOtGetThreadState(socket));
      socket.on("ot:setThreadRunning", (data: { running: boolean }) => this.handleOtSetThreadRunning(socket, data));
      socket.on("ot:getThreadRunOnConnect", () => {
        socket.emit("ot:threadRunOnConnect", { runOnConnect: this.appSettingsService.getThreadRunOnConnect() });
      });
      socket.on("ot:setThreadRunOnConnect", (data: { runOnConnect: boolean }) => {
        this.appSettingsService.setThreadRunOnConnect(!!data.runOnConnect);
        socket.emit("ot:threadRunOnConnect", { runOnConnect: !!data.runOnConnect });
      });
      socket.on("ot:getRouterTable", () => this.handleOtGetRouterTable(socket));
      socket.on("ot:getChildTable", () => this.handleOtGetChildTable(socket));

      socket.on("commissioner:connect", (data: { eui64?: string; psk?: string; timeout?: number }) =>
        this.handleCommissionerConnect(socket, data)
      );
      socket.on("commissioner:getJoinerTable", () => this.handleCommissionerGetJoinerTable(socket));

      socket.on("disconnect", () => console.log(`[WS] Client disconnected: ${socket.id}`));
    });
  }

  private sendCurrentConfig(socket: Socket): void {
    socket.emit("config:current", this.serialConfigService.getLatest());
  }

  private sendSerialStatus(socket: Socket): void {
    socket.emit("serial:status", this.communicate.getStatus());
  }

  private validateConfig(data: {
    serialPort?: string;
    baudRate?: number;
    commandPrefix?: string;
  }): string | null {
    if (data.serialPort !== undefined) {
      if (typeof data.serialPort !== "string" || !data.serialPort.trim()) return "Serial port is required";
    }
    if (data.baudRate !== undefined) {
      const n = Number(data.baudRate);
      if (!Number.isInteger(n) || n < 9600 || n > 2000000) return "Baud rate must be an integer between 9600 and 2000000";
    }
    return null;
  }

  private async handleConfigSave(
    socket: Socket,
    data: { serialPort: string; baudRate: number; commandPrefix?: string }
  ): Promise<void> {
    const err = this.validateConfig(data);
    if (err) {
      socket.emit("config:error", { error: err });
      return;
    }
    try {
      await this.communicate.resetSerialPort();
      const config = this.serialConfigService.saveOrUpdate({
        serialPort: data.serialPort.trim(),
        baudRate: Number(data.baudRate),
        commandPrefix: (data.commandPrefix ?? "").trim() || "ot",
      });
      socket.emit("config:saved", config);
      this.io.emit("config:current", config);
      await this.communicate.connect();
      socket.emit("serial:status", this.communicate.getStatus());
    } catch (error) {
      socket.emit("config:error", { error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  private async handleConfigUpdate(
    socket: Socket,
    data: { id: number; serialPort?: string; baudRate?: number; commandPrefix?: string }
  ): Promise<void> {
    if (typeof data.id !== "number" || !Number.isInteger(data.id) || data.id < 1) {
      socket.emit("config:error", { error: "Invalid config id" });
      return;
    }
    const err = this.validateConfig(data);
    if (err) {
      socket.emit("config:error", { error: err });
      return;
    }
    try {
      const updates: { serialPort?: string; baudRate?: number; commandPrefix?: string } = {};
      if (data.serialPort !== undefined) updates.serialPort = data.serialPort.trim();
      if (data.baudRate !== undefined) updates.baudRate = Number(data.baudRate);
      if (data.commandPrefix !== undefined) updates.commandPrefix = data.commandPrefix.trim();
      const config = this.serialConfigService.update(data.id, updates);
      if (config) {
        await this.communicate.resetSerialPort();
        socket.emit("config:updated", config);
        this.io.emit("config:current", config);
      } else {
        socket.emit("config:error", { error: "Config not found" });
      }
    } catch (error) {
      socket.emit("config:error", { error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  private async handleSerialConnect(socket: Socket): Promise<void> {
    try {
      await this.communicate.connect();
      socket.emit("serial:connected", { success: true, status: this.communicate.getStatus() });
      this.io.emit("serial:status", this.communicate.getStatus());
    } catch (error) {
      socket.emit("serial:error", {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  private async handleSerialDisconnect(socket: Socket): Promise<void> {
    try {
      await this.communicate.disconnect();
      socket.emit("serial:disconnected", { success: true });
      this.io.emit("serial:status", this.communicate.getStatus());
    } catch (error) {
      socket.emit("serial:error", {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  private async handleSerialTest(
    socket: Socket,
    data: { serialPort: string; baudRate: number; commandPrefix?: string }
  ): Promise<void> {
    const err = this.validateConfig(data);
    if (err) {
      socket.emit("serial:test:result", { success: false, error: err });
      return;
    }
    const path = data.serialPort.trim();
    const baudRate = Number(data.baudRate);
    try {
      const result = await this.communicate.testConnection(path, baudRate);
      socket.emit("serial:test:result", result);
    } catch (error) {
      socket.emit("serial:test:result", {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  private async handleOtGetConfig(socket: Socket): Promise<void> {
    const status = this.communicate.getStatus();
    if (!status.isConnected) {
      socket.emit("ot:config", { error: "Serial not connected. Connect serial first." });
      return;
    }
    let config = this.communicate.getLastOtConfig();
    if (config != null) {
      socket.emit("ot:config", config);
      return;
    }
    try {
      config = await this.communicate.fetchOtConfig();
      socket.emit("ot:config", config);
    } catch (error) {
      socket.emit("ot:config", { error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  private validateOtSetConfig(data: {
    panid?: string;
    channel?: number;
    networkName?: string;
  }): string | null {
    if (data.panid != null && data.panid !== "") {
      const panid = data.panid.trim();
      if (!/^0x[0-9a-fA-F]{1,4}$/.test(panid) && !/^[0-9a-fA-F]{1,4}$/.test(panid)) return "PAN ID không hợp lệ";
      const num = panid.startsWith("0x") ? parseInt(panid.slice(2), 16) : parseInt(panid, 16);
      if (Number.isNaN(num) || num < 0 || num > 0xfffe) return "PAN ID phải trong khoảng 0x0000–0xFFFE";
    }
    if (data.channel != null) {
      const ch = Number(data.channel);
      if (!Number.isInteger(ch) || ch < 11 || ch > 26) return "Channel phải là số nguyên 11–26";
    }
    if (data.networkName != null && data.networkName !== "") {
      const name = data.networkName.trim();
      if (Buffer.byteLength(name, "utf8") > 16) return "Network Name tối đa 16 byte (UTF-8)";
      if (/[\x00-\x1f\x7f]/.test(name)) return "Network Name không được chứa ký tự điều khiển";
    }
    return null;
  }

  private async handleOtSetConfig(
    socket: Socket,
    _data: { panid?: string; channel?: number; networkName?: string }
  ): Promise<void> {
    if (!this.communicate.getStatus().isConnected) {
      socket.emit("ot:setConfig:result", { success: false, error: "Serial not connected." });
      return;
    }
    socket.emit("ot:setConfig:result", { success: false, error: "Use frame protocol for set config." });
  }

  private async handleOtGetThreadState(socket: Socket): Promise<void> {
    if (!this.communicate.getStatus().isConnected) {
      socket.emit("ot:threadState", { error: "Serial not connected. Connect serial first." });
      return;
    }
    const state = this.communicate.getLastThreadState();
    if (state != null) {
      socket.emit("ot:threadState", state);
      return;
    }
    socket.emit("ot:threadState", { error: "Use frame protocol." });
  }

  private async handleOtSetThreadRunning(socket: Socket, _data: { running: boolean }): Promise<void> {
    if (!this.communicate.getStatus().isConnected) {
      socket.emit("ot:setThreadRunning:result", { success: false, error: "Serial not connected." });
      return;
    }
    socket.emit("ot:setThreadRunning:result", { success: false, error: "Use frame protocol." });
  }

  private async handleOtGetRouterTable(socket: Socket): Promise<void> {
    if (!this.communicate.getStatus().isConnected) {
      socket.emit("ot:routerTable", { error: "Serial not connected. Connect serial first." });
      return;
    }
    const table = this.communicate.getLastRouterTable();
    socket.emit("ot:routerTable", table ?? { error: "No data." });
  }

  private async handleOtGetChildTable(socket: Socket): Promise<void> {
    if (!this.communicate.getStatus().isConnected) {
      socket.emit("ot:childTable", { error: "Serial not connected. Connect serial first." });
      return;
    }
    const table = this.communicate.getLastChildTable();
    socket.emit("ot:childTable", table ?? { error: "No data." });
  }

  private async handleCommissionerGetJoinerTable(socket: Socket): Promise<void> {
    if (!this.communicate.getStatus().isConnected) {
      socket.emit("commissioner:joinerTable", { error: "Serial not connected. Connect serial first." });
      return;
    }
    const table = this.communicate.getLastJoinerTable();
    socket.emit("commissioner:joinerTable", table ?? { error: "No data." });
  }

  private async handleCommissionerConnect(
    socket: Socket,
    _data: { eui64?: string; psk?: string; timeout?: number }
  ): Promise<void> {
    if (!this.communicate.getStatus().isConnected) {
      socket.emit("commissioner:connect:result", { success: false, error: "Serial not connected. Connect serial first." });
      return;
    }
    socket.emit("commissioner:connect:result", { success: false, error: "Use frame protocol for commissioner." });
  }
}
