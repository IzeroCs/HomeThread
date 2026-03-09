/**
 * WebSocket Server - Chỉ emit dữ liệu tới frontend.
 * Dữ liệu và khởi tạo giao tiếp nằm ở CommunicateManager; lấy qua getter.
 */

import { Server, Socket } from "socket.io";
import type { BrConnectionConfigService, CommunicateManager } from "@communicate";
import { AppSettingsService } from "@settings/app-settings.service";
import { logger } from "@utils/logger.util";
import { getBackendAddresses } from "@utils/ipv6.util";
import { EVENTS } from "shared/src/events";
import { validateBrConnectionConfig, validateOtSetConfig } from "shared/src/validation";

const wsLog = logger.child("WS");

export class WebSocketServer {
  private io: Server;
  private brConnectionConfigService: BrConnectionConfigService;
  private appSettingsService: AppSettingsService;
  private communicate: CommunicateManager;

  constructor(
    io: Server,
    brConnectionConfigService: BrConnectionConfigService,
    appSettingsService: AppSettingsService,
    communicate: CommunicateManager
  ) {
    this.io = io;
    this.brConnectionConfigService = brConnectionConfigService;
    this.appSettingsService = appSettingsService;
    this.communicate = communicate;
    this.setupEventHandlers();
  }

  /** Gọi khi server khởi động: nếu đã có config thì tự kết nối BR (ở main). */
  async connectSerialIfConfigured(): Promise<void> {
    await this.communicate.connectIfConfigured();
  }

  async close(): Promise<void> {
    await this.communicate.close();
  }

  private setupEventHandlers(): void {
    this.io.on("connection", (socket: Socket) => {
      wsLog.info(`Client connected: ${socket.id}`);

      // Notify CommunicateManager về frontend connection
      this.communicate.onFrontendConnected();

      this.sendCurrentConfig(socket);
      this.sendSerialStatus(socket);

      const lastThreadState = this.communicate.getLastThreadState();
      if (lastThreadState != null) socket.emit(EVENTS.OT_THREAD_STATE, lastThreadState);
      const lastOtConfig = this.communicate.getLastOtConfig();
      if (lastOtConfig != null) socket.emit(EVENTS.OT_CONFIG, lastOtConfig);
      const lastRouterTable = this.communicate.getLastRouterTable();
      if (lastRouterTable != null) socket.emit(EVENTS.OT_ROUTER_TABLE, lastRouterTable);
      const lastChildTable = this.communicate.getLastChildTable();
      if (lastChildTable != null) socket.emit(EVENTS.OT_CHILD_TABLE, lastChildTable);
      const lastJoinerTable = this.communicate.getLastJoinerTable();
      if (lastJoinerTable != null) socket.emit(EVENTS.OT_JOINER_TABLE, lastJoinerTable);

      socket.on(EVENTS.CONFIG_GET, () => this.sendCurrentConfig(socket));
      socket.on(EVENTS.CONFIG_SAVE, (data: { brHost: string; brPort: number; useMdns?: boolean }) =>
        this.handleConfigSave(socket, data)
      );
      socket.on(EVENTS.CONFIG_UPDATE, (data: { id: number; brHost?: string; brPort?: number; useMdns?: boolean }) =>
        this.handleConfigUpdate(socket, data)
      );

      socket.on(EVENTS.SERIAL_CONNECT, () => this.handleSerialConnect(socket));
      socket.on(EVENTS.SERIAL_DISCONNECT, () => this.handleSerialDisconnect(socket));
      socket.on(EVENTS.SERIAL_STATUS, () => this.sendSerialStatus(socket));
      socket.on(EVENTS.SERIAL_TEST, (data: { brHost: string; brPort: number }) =>
        this.handleBrTest(socket, data)
      );

      socket.on(EVENTS.OT_GET_CONFIG, () => this.handleOtGetConfig(socket));
      socket.on(EVENTS.OT_SET_CONFIG, (data: { panid?: string; channel?: number; networkName?: string; extendedPanId?: string; networkKey?: string }) =>
        this.handleOtSetConfig(socket, data)
      );
      socket.on(EVENTS.OT_GET_THREAD_STATE, () => this.handleOtGetThreadState(socket));
      socket.on(EVENTS.OT_SET_THREAD_RUNNING, (data: { running: boolean }) => this.handleOtSetThreadRunning(socket, data));
      socket.on(EVENTS.OT_START_THREAD, () => this.handleOtStartThread(socket));
      socket.on(EVENTS.OT_STOP_THREAD, () => this.handleOtStopThread(socket));
      socket.on(EVENTS.OT_GET_THREAD_RUN_ON_CONNECT, () => {
        socket.emit(EVENTS.OT_THREAD_RUN_ON_CONNECT, { runOnConnect: this.appSettingsService.getThreadRunOnConnect() });
      });
      socket.on(EVENTS.OT_SET_THREAD_RUN_ON_CONNECT, (data: { runOnConnect: boolean }) => {
        this.appSettingsService.setThreadRunOnConnect(!!data.runOnConnect);
        socket.emit(EVENTS.OT_THREAD_RUN_ON_CONNECT, { runOnConnect: !!data.runOnConnect });
      });
      socket.on(EVENTS.DEVICE_RESET, () => this.handleDeviceReset(socket));
      socket.on(EVENTS.DEVICE_FACTORY_RESET, () => this.handleDeviceFactoryReset(socket));
      socket.on(EVENTS.OT_GET_ROUTER_TABLE, () => this.handleOtGetRouterTable(socket));
      socket.on(EVENTS.OT_GET_CHILD_TABLE, () => this.handleOtGetChildTable(socket));

      socket.on(EVENTS.COMMISSIONER_CONNECT, (data: { eui64?: string; psk?: string; timeout?: number }) =>
        this.handleCommissionerConnect(socket, data)
      );
      socket.on(EVENTS.COMMISSIONER_GET_JOINER_TABLE, () => this.handleCommissionerGetJoinerTable(socket));
      socket.on(EVENTS.SRP_REGISTER, (data: { hostname?: string; backendIPv6: string; port?: number }) =>
        this.handleSrpRegister(socket, data));

      socket.on("disconnect", () => {
        wsLog.info(`Client disconnected: ${socket.id}`);
        // Notify CommunicateManager về frontend disconnection
        this.communicate.onFrontendDisconnected();
      });
    });
  }

  private sendCurrentConfig(socket: Socket): void {
    socket.emit(EVENTS.CONFIG_CURRENT, this.brConnectionConfigService.getLatest());
    socket.emit(EVENTS.SYSTEM_INFO, getBackendAddresses());
  }

  private sendSerialStatus(socket: Socket): void {
    socket.emit(EVENTS.SERIAL_STATUS, this.communicate.getStatus());
  }

  private validateConfig = validateBrConnectionConfig;

  private async handleConfigSave(
    socket: Socket,
    data: { brHost: string; brPort: number; useMdns?: boolean }
  ): Promise<void> {
    const err = this.validateConfig(data);
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
      socket.emit(EVENTS.SERIAL_STATUS, this.communicate.getStatus());
    } catch (error) {
      socket.emit(EVENTS.CONFIG_ERROR, { error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  private async handleConfigUpdate(
    socket: Socket,
    data: { id: number; brHost?: string; brPort?: number; useMdns?: boolean }
  ): Promise<void> {
    if (typeof data.id !== "number" || !Number.isInteger(data.id) || data.id < 1) {
      socket.emit(EVENTS.CONFIG_ERROR, { error: "Invalid config id" });
      return;
    }
    const err = this.validateConfig(data);
    if (err) {
      socket.emit(EVENTS.CONFIG_ERROR, { error: err });
      return;
    }
    try {
      const updates: { brHost?: string; brPort?: number; useMdns?: boolean } = {};
      if (data.brHost !== undefined) updates.brHost = data.brHost.trim();
      if (data.brPort !== undefined) updates.brPort = Number(data.brPort);
      if (data.useMdns !== undefined) updates.useMdns = data.useMdns;
      const config = this.brConnectionConfigService.update(data.id, updates);
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

  private async handleSerialConnect(socket: Socket): Promise<void> {
    try {
      await this.communicate.connect();
      socket.emit(EVENTS.SERIAL_CONNECTED, { success: true, status: this.communicate.getStatus() });
      this.io.emit(EVENTS.SERIAL_STATUS, this.communicate.getStatus());
    } catch (error) {
      socket.emit(EVENTS.SERIAL_ERROR, {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  private async handleSerialDisconnect(socket: Socket): Promise<void> {
    try {
      await this.communicate.disconnect();
      socket.emit(EVENTS.SERIAL_DISCONNECTED, { success: true });
      this.io.emit(EVENTS.SERIAL_STATUS, this.communicate.getStatus());
    } catch (error) {
      socket.emit("serial:error", {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  private async handleBrTest(
    socket: Socket,
    data: { brHost: string; brPort: number }
  ): Promise<void> {
    const err = this.validateConfig(data);
    if (err) {
      socket.emit(EVENTS.SERIAL_TEST_RESULT, { success: false, error: err });
      return;
    }
    const host = data.brHost.trim();
    const port = Number(data.brPort);
    try {
      const result = await this.communicate.testConnection(host, port);
      socket.emit(EVENTS.SERIAL_TEST_RESULT, result);
    } catch (error) {
      socket.emit(EVENTS.SERIAL_TEST_RESULT, {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  private async handleOtGetConfig(socket: Socket): Promise<void> {
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

  private validateOtSetConfigMethod = validateOtSetConfig;

  private async handleOtSetConfig(
    socket: Socket,
    data: { panid?: string; channel?: number; networkName?: string; extendedPanId?: string; networkKey?: string }
  ): Promise<void> {
    if (!this.communicate.getStatus().isConnected) {
      socket.emit(EVENTS.OT_SET_CONFIG_RESULT, { success: false, error: "BR not connected." });
      return;
    }
    const err = this.validateOtSetConfigMethod(data);
    if (err) {
      socket.emit(EVENTS.OT_SET_CONFIG_RESULT, { success: false, error: err });
      return;
    }

    // Gửi các lệnh set config qua frame protocol
    const results: Array<{ field: string; success: boolean; error?: string }> = [];

    try {
      // Set PAN ID nếu có
      if (data.panid != null && data.panid !== "") {
        const panidResult = await this.communicate.setPanid(data.panid);
        if (panidResult.ack) {
          results.push({ field: "PAN ID", success: true });
        } else {
          const errorMsg = panidResult.errorCode === 0x04 ? "Invalid PAN ID" : "Failed to set PAN ID";
          results.push({ field: "PAN ID", success: false, error: errorMsg });
        }
      }

      // Set Channel nếu có
      if (data.channel != null) {
        const channelResult = await this.communicate.setChannel(data.channel);
        if (channelResult.ack) {
          results.push({ field: "Channel", success: true });
        } else {
          const errorMsg = channelResult.errorCode === 0x04 ? "Invalid Channel" : "Failed to set Channel";
          results.push({ field: "Channel", success: false, error: errorMsg });
        }
      }

      // Set Network Name nếu có
      if (data.networkName != null && data.networkName !== "") {
        const networkNameResult = await this.communicate.setNetworkName(data.networkName);
        if (networkNameResult.ack) {
          results.push({ field: "Network Name", success: true });
        } else {
          const errorMsg = networkNameResult.errorCode === 0x04 ? "Invalid Network Name" : "Failed to set Network Name";
          results.push({ field: "Network Name", success: false, error: errorMsg });
        }
      }

      // Set Extended PAN ID nếu có
      if (data.extendedPanId != null && data.extendedPanId !== "") {
        const extendedPanIdResult = await this.communicate.setExtendedPanid(data.extendedPanId);
        if (extendedPanIdResult.ack) {
          results.push({ field: "Extended PAN ID", success: true });
        } else {
          const errorMsg = extendedPanIdResult.errorCode === 0x04 ? "Invalid Extended PAN ID" : "Failed to set Extended PAN ID";
          results.push({ field: "Extended PAN ID", success: false, error: errorMsg });
        }
      }

      // Set Network Key nếu có
      if (data.networkKey != null && data.networkKey !== "") {
        const networkKeyResult = await this.communicate.setNetworkKey(data.networkKey);
        if (networkKeyResult.ack) {
          results.push({ field: "Network Key", success: true });
        } else {
          const errorMsg = networkKeyResult.errorCode === 0x04 ? "Invalid Network Key" : "Failed to set Network Key";
          results.push({ field: "Network Key", success: false, error: errorMsg });
        }
      }

      // Kiểm tra kết quả: nếu tất cả thành công thì success, nếu có lỗi thì trả về lỗi đầu tiên
      const failedResults = results.filter((r) => !r.success);
      if (failedResults.length > 0) {
        const firstError = failedResults[0];
        socket.emit(EVENTS.OT_SET_CONFIG_RESULT, {
          success: false,
          error: `${firstError.field}: ${firstError.error ?? "Failed"}`,
        });
      } else if (results.length > 0) {
        // Tất cả thành công, fetch lại config để cập nhật
        await this.communicate.fetchOtConfig();
        socket.emit(EVENTS.OT_SET_CONFIG_RESULT, { success: true });
      } else {
        // Không có field nào để set
        socket.emit(EVENTS.OT_SET_CONFIG_RESULT, { success: false, error: "No fields to set" });
      }
    } catch (error) {
      socket.emit(EVENTS.OT_SET_CONFIG_RESULT, {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  private async handleOtGetThreadState(socket: Socket): Promise<void> {
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

  private async handleOtSetThreadRunning(socket: Socket, _data: { running: boolean }): Promise<void> {
    if (!this.communicate.getStatus().isConnected) {
      socket.emit(EVENTS.OT_SET_THREAD_RUNNING_RESULT, { success: false, error: "BR not connected." });
      return;
    }
    socket.emit(EVENTS.OT_SET_THREAD_RUNNING_RESULT, { success: false, error: "Use frame protocol." });
  }

  private async handleOtStartThread(socket: Socket): Promise<void> {
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

  private async handleOtStopThread(socket: Socket): Promise<void> {
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

  private async handleOtGetRouterTable(socket: Socket): Promise<void> {
    if (!this.communicate.getStatus().isConnected) {
      socket.emit(EVENTS.OT_ROUTER_TABLE, { error: "BR not connected. Connect to BR first." });
      return;
    }
    const table = this.communicate.getLastRouterTable();
    socket.emit(EVENTS.OT_ROUTER_TABLE, table ?? { error: "No data." });
  }

  private async handleOtGetChildTable(socket: Socket): Promise<void> {
    if (!this.communicate.getStatus().isConnected) {
      socket.emit(EVENTS.OT_CHILD_TABLE, { error: "BR not connected. Connect to BR first." });
      return;
    }
    const table = this.communicate.getLastChildTable();
    socket.emit(EVENTS.OT_CHILD_TABLE, table ?? { error: "No data." });
  }

  private async handleCommissionerGetJoinerTable(socket: Socket): Promise<void> {
    if (!this.communicate.getStatus().isConnected) {
      socket.emit(EVENTS.OT_JOINER_TABLE, { error: "BR not connected. Connect to BR first." });
      return;
    }
    const table = this.communicate.getLastJoinerTable();
    socket.emit(EVENTS.OT_JOINER_TABLE, table ?? { error: "No data." });
  }

  private async handleCommissionerConnect(
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

  private async handleSrpRegister(
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

  private async handleDeviceReset(socket: Socket): Promise<void> {
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

  private async handleDeviceFactoryReset(socket: Socket): Promise<void> {
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
