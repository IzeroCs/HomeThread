/**
 * CommunicateManager - Khởi tạo và quản lý giao tiếp phần cứng (Serial + frame protocol).
 * Điều phối serial + frame; dữ liệu OT/Thread lưu ở OtConfigManager và ThreadDataManager, lấy qua getter.
 * Có thể đăng ký onBroadcast để push event (serial:data, serial:status, ot:config, ...) ra ngoài.
 */

import { SerialConfigService } from "./SerialConfigService";
import { SerialPortService } from "./SerialPort";
import { CommandManager } from "./CommandManager";
import { OtConfigManager, type OtConfig } from "./OtConfigManager";
import { ThreadDataManager, type ThreadState, type TableData } from "./ThreadDataManager";
import { PollingManager } from "./PollingManager";
import { FrameParser, type ParsedFrame } from "./frame";
import { AppSettingsService } from "../services/AppSettingsService";
import { serialLogger, frameLogger } from "../utils/logger";

export type { OtConfig } from "./OtConfigManager";
export type { ThreadState, TableData } from "./ThreadDataManager";

const RECONNECT_INTERVAL_MS = 3000;
/** Ping 5 lần không có phản hồi (bất kỳ frame từ leader) thì đóng port và reconnect. */
const PING_WITHOUT_RESPONSE_LIMIT = 5;

export type SerialStatus = { isConnected: boolean; path: string; baudRate: number };

export type OnBroadcast = (event: string, data?: unknown) => void;

export class CommunicateManager {
  private serialConfigService: SerialConfigService;
  private appSettingsService: AppSettingsService;
  private onBroadcast: OnBroadcast | null = null;

  private serialPort: SerialPortService | null = null;
  private frameUnsubscribe: (() => void) | null = null;
  private autoReconnectEnabled = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Số lần PING liên tiếp không nhận được bất kỳ frame nào từ leader; đạt 5 thì đóng port và reconnect. */
  private pingWithoutResponseCount = 0;

  private otConfigManager = new OtConfigManager();
  private threadDataManager = new ThreadDataManager();

  private pollingManager = new PollingManager();
  private pingIntervalId: ReturnType<typeof setInterval> | null = null;
  private static readonly PING_INTERVAL_MS = 15000;

  private frameParser = new FrameParser();
  private commandManager: CommandManager | null = null;
  /** Chỉ bật polling (OT config) sau khi leader gửi PING và ta đã trả ACK. */
  private leaderReady = false;

  constructor(
    serialConfigService: SerialConfigService,
    appSettingsService: AppSettingsService,
    onBroadcast?: OnBroadcast
  ) {
    this.serialConfigService = serialConfigService;
    this.appSettingsService = appSettingsService;
    this.onBroadcast = onBroadcast ?? null;
  }

  setOnBroadcast(cb: OnBroadcast | null): void {
    this.onBroadcast = cb;
  }

  private broadcast(event: string, data?: unknown): void {
    this.onBroadcast?.(event, data);
  }

  getStatus(): SerialStatus {
    if (this.serialPort) return this.serialPort.getStatus();
    return { isConnected: false, path: "", baudRate: 0 };
  }

  getLastThreadState(): ThreadState {
    return this.threadDataManager.getThreadState();
  }

  getLastOtConfig(): OtConfig | null {
    return this.otConfigManager.get();
  }

  getLastRouterTable(): TableData {
    return this.threadDataManager.getRouterTable();
  }

  getLastChildTable(): TableData {
    return this.threadDataManager.getChildTable();
  }

  getLastJoinerTable(): TableData {
    return this.threadDataManager.getJoinerTable();
  }

  async connect(): Promise<void> {
    this.autoReconnectEnabled = true;
    await this.connectSerialInternal();
  }

  async disconnect(): Promise<void> {
    this.autoReconnectEnabled = false;
    this.clearReconnectTimer();
    this.stopAllPolling();
    if (this.serialPort) {
      await this.serialPort.close();
      this.serialPort = null;
      this.frameUnsubscribe = null;
      this.clearPendingFrames();
      this.frameParser.reset();
      this.broadcast("serial:status", { isConnected: false, path: "", baudRate: 0 });
    }
  }

  async connectIfConfigured(): Promise<void> {
    await this.connectSerialInternal();
  }

  async resetSerialPort(): Promise<void> {
    this.clearReconnectTimer();
    if (this.frameUnsubscribe) {
      this.frameUnsubscribe();
      this.frameUnsubscribe = null;
    }
    this.clearPendingFrames();
    this.frameParser.reset();
    if (this.serialPort) {
      await this.serialPort.close();
      this.serialPort = null;
      this.broadcast("serial:status", { isConnected: false, path: "", baudRate: 0 });
    }
  }

  async testConnection(path: string, baudRate: number): Promise<{ success: boolean; error?: string }> {
    const status = this.serialPort?.getStatus();
    if (status?.isConnected && status.path === path) {
      return { success: true };
    }
    const tempPort = new SerialPortService({ path, baudRate });
    try {
      await tempPort.open();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    } finally {
      await tempPort.close();
    }
  }

  async fetchOtConfig(): Promise<OtConfig> {
    if (!this.serialPort?.getStatus().isConnected) {
      return { error: "Serial not connected. Connect serial first." };
    }
    const payload = await this.pollingManager.fetchOtConfigPayload(
      (cmd, data) => this.sendPullRequestInternal(cmd, data),
      () => this.otConfigManager.get() ?? {}
    );
    this.otConfigManager.set(payload);
    this.broadcast("ot:config", payload);
    return payload;
  }

  sendPullRequest(cmd: number, data?: Buffer): Promise<{ ack: boolean; data?: Buffer; errorCode?: number }> {
    return this.sendPullRequestInternal(cmd, data);
  }

  private stopAllPolling(): void {
    this.pollingManager.stopAll();
    this.threadDataManager.clear();
    this.otConfigManager.clear();
    if (this.pingIntervalId != null) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
  }

  private initializeSerialPort(config: {
    serialPort: string;
    baudRate: number;
  }): void {
    if (this.frameUnsubscribe) {
      this.frameUnsubscribe();
      this.frameUnsubscribe = null;
    }
    if (this.serialPort) {
      this.serialPort.close().catch((err) => serialLogger.error(String(err?.message ?? err)));
      this.serialPort = null;
    }
    this.clearPendingFrames();
    this.frameParser.reset();

    this.serialPort = new SerialPortService({
      path: config.serialPort,
      baudRate: config.baudRate,
    });

    this.commandManager = new CommandManager({
      writeRaw: (buf) => this.serialPort!.writeRaw(buf),
      broadcast: (event, data) => this.broadcast(event, data),
      onAckDataToConfig: (partial) => {
        this.otConfigManager.update(partial);
        this.broadcast("ot:config", this.otConfigManager.get());
      },
    });

    this.serialPort.setOnDisconnect(() => this.onSerialDisconnected());

    this.frameUnsubscribe = this.serialPort.onRawData((chunk: Buffer) => {
      this.broadcast("serial:data", chunk.toString("hex"));
      this.frameParser.push(
        chunk,
        (frame: ParsedFrame) => {
          this.pingWithoutResponseCount = 0;
          this.commandManager!.handle(frame);
        },
        (bytes, reason) => {
          const text = bytes.toString("utf8").replace(/[\r\n]+/g, " ").trim();
          serialLogger.info(`RX (lỗi: ${reason}): ${bytes.length} bytes ${text}`);
        }
      );
    });
  }

  private clearPendingFrames(): void {
    this.commandManager?.clearPending();
  }

  /** Bật gửi PING định kỳ (ngay 1 lần + mỗi PING_INTERVAL_MS). */
  private startPingInterval(): void {
    if (this.pingIntervalId != null) return;
    if (!this.serialPort?.getStatus().isConnected) return;
    this.sendPingToLeader();
    this.pingIntervalId = setInterval(() => {
      this.sendPingToLeader();
    }, CommunicateManager.PING_INTERVAL_MS);
  }

  /** Gửi 1 frame PING. Đã gửi 5 lần không có phản hồi thì đóng port và reconnect. */
  private sendPingToLeader(): void {
    if (!this.serialPort?.getStatus().isConnected || !this.commandManager) return;
    if (this.pingWithoutResponseCount >= PING_WITHOUT_RESPONSE_LIMIT) {
      serialLogger.warn("Ping " + PING_WITHOUT_RESPONSE_LIMIT + " lần không có phản hồi — đóng port và reconnect.");
      const port = this.serialPort;
      port.close().then(() => this.onSerialDisconnected()).catch(() => this.onSerialDisconnected());
      return;
    }
    try {
      const frameId = this.commandManager.consumeNextFrameId();
      const pingFrame = this.commandManager.sendPing(frameId);
      this.serialPort.writeRaw(pingFrame).catch((err) => serialLogger.warn(`Failed to send PING to leader: ${err?.message ?? err}`));
      frameLogger.log("TX frameId=0x" + frameId.toString(16).padStart(2, "0") + " cmd=0x04 (PING) len=0");
      this.pingWithoutResponseCount++;
    } catch (err) {
      serialLogger.warn(`Failed to build PING for leader: ${err}`);
    }
  }

  private sendPullRequestInternal(
    cmd: number,
    data?: Buffer
  ): Promise<{ ack: boolean; data?: Buffer; errorCode?: number }> {
    return this.commandManager!.sendRequest(cmd, data);
  }

  private onSerialDisconnected(): void {
    this.leaderReady = false;
    this.pingWithoutResponseCount = 0;
    this.stopAllPolling();
    this.frameUnsubscribe = null;
    this.clearPendingFrames();
    this.frameParser.reset();
    this.commandManager = null;
    this.serialPort = null;
    this.broadcast("serial:status", { isConnected: false, path: "", baudRate: 0 });
    this.scheduleReconnect();
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    if (!this.autoReconnectEnabled) return;
    const config = this.serialConfigService.getLatest();
    if (!config) return;
    serialLogger.info(`Will retry connection in ${RECONNECT_INTERVAL_MS}ms...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectSerialInternal();
    }, RECONNECT_INTERVAL_MS);
  }

  private async connectSerialInternal(): Promise<void> {
    const config = this.serialConfigService.getLatest();
    if (!config) return;
    try {
      if (!this.serialPort) {
        this.initializeSerialPort(config);
      }
      await this.serialPort!.open();

      this.clearReconnectTimer();
      this.pingWithoutResponseCount = 0;
      this.broadcast("serial:connected", { success: true, status: this.serialPort!.getStatus() });
      this.broadcast("serial:status", this.serialPort!.getStatus());
      serialLogger.info(`Connected: ${config.serialPort}`);
      this.startPingInterval();
    } catch (error) {
      serialLogger.error(`Connection failed: ${error}`);
      this.broadcast("serial:status", { isConnected: false, path: config.serialPort, baudRate: config.baudRate });
      this.scheduleReconnect();
    }
  }

  /** Bật poll OT config (gọi từ bên ngoài khi leader ready, ví dụ sau khi nhận PING). */
  startOtConfigPolling(): void {
    if (!this.serialPort?.getStatus().isConnected) return;
    this.pollingManager.startOtConfigPolling(
      PollingManager.OT_CONFIG_POLL_MS,
      (cmd, data) => this.sendPullRequestInternal(cmd, data),
      () => this.otConfigManager.get() ?? {},
      (payload) => {
        this.otConfigManager.set(payload);
        this.broadcast("ot:config", payload);
      },
      (err) => {
        this.otConfigManager.set({ error: err instanceof Error ? err.message : "Unknown error" });
        this.broadcast("ot:config", this.otConfigManager.get());
      }
    );
  }

  async close(): Promise<void> {
    this.autoReconnectEnabled = false;
    this.clearReconnectTimer();
    if (this.frameUnsubscribe) {
      this.frameUnsubscribe();
      this.frameUnsubscribe = null;
    }
    this.clearPendingFrames();
    this.frameParser.reset();
    if (this.serialPort) {
      await this.serialPort.close();
      this.serialPort = null;
    }
  }
}
