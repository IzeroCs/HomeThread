/**
 * CommunicateManager - Khởi tạo và quản lý giao tiếp phần cứng (Serial + frame protocol).
 * Nắm toàn bộ dữ liệu (lastThreadState, lastOtConfig, ...); nơi khác muốn lấy thì gọi getter.
 * Có thể đăng ký onBroadcast để push event (serial:data, serial:status, ot:config, ...) ra ngoài.
 */

import { SerialConfigService } from "./SerialConfigService";
import { SerialPortService } from "./SerialPort";
import { buildFrame, CMD, FrameParser, NACK_MESSAGE, type ParsedFrame } from "./frame";
import { CMD_NAMES } from "./frame/constants";
import { AppSettingsService } from "../services/AppSettingsService";

const RECONNECT_INTERVAL_MS = 3000;
/** Nếu đã từng nhận RX mà không còn byte nào trong 20s → coi mất kết nối (ESP reset không emit close). */
const NO_RX_WATCHDOG_MS = 20000;
const RX_WATCHDOG_CHECK_MS = 10000;
const FRAME_RESPONSE_TIMEOUT_MS = 5000;

function isMostlyPrintable(buf: Buffer): boolean {
  if (buf.length === 0) return true;
  let printable = 0;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i]!;
    if (b >= 0x20 && b < 0x7f) printable++;
    else if (b === 0x0a || b === 0x0d || b === 0x09) printable++;
  }
  return printable / buf.length >= 0.8;
}

export type SerialStatus = { isConnected: boolean; path: string; baudRate: number };

export type OtConfig = {
  panid?: string;
  channel?: number;
  networkName?: string;
  ipaddr?: string;
  datasetActive?: string;
  error?: string;
};

export type ThreadState = { running: boolean; state?: string } | null;

export type TableData = { headers?: string[]; rows?: string[][]; error?: string } | null;

export type OnBroadcast = (event: string, data?: unknown) => void;

export class CommunicateManager {
  private serialConfigService: SerialConfigService;
  private appSettingsService: AppSettingsService;
  private onBroadcast: OnBroadcast | null = null;

  private serialPort: SerialPortService | null = null;
  private frameUnsubscribe: (() => void) | null = null;
  private autoReconnectEnabled = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Thời điểm nhận byte cuối (raw RX); dùng watchdog phát hiện port “chết” sau ESP reset. */
  private lastRawRxTime = 0;
  private rxWatchdogIntervalId: ReturnType<typeof setInterval> | null = null;

  private lastThreadState: ThreadState = null;
  private threadStateIntervalId: ReturnType<typeof setInterval> | null = null;
  private static readonly THREAD_STATE_POLL_MS = 4000;

  private lastOtConfig: OtConfig | null = null;
  private otConfigIntervalId: ReturnType<typeof setInterval> | null = null;
  private static readonly OT_CONFIG_POLL_MS = 6000;

  private lastRouterTable: TableData = null;
  private lastChildTable: TableData = null;
  private dashboardTableIntervalId: ReturnType<typeof setInterval> | null = null;
  private dashboardTableChildTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private static readonly DASHBOARD_TABLE_POLL_MS = 6000;
  private static readonly CHILD_TABLE_DELAY_MS = 1500;

  private lastJoinerTable: TableData = null;
  private joinerTableIntervalId: ReturnType<typeof setInterval> | null = null;
  private static readonly JOINER_TABLE_POLL_MS = 6000;

  private serialKeepaliveIntervalId: ReturnType<typeof setInterval> | null = null;
  private static readonly SERIAL_KEEPALIVE_MS = 15000;

  private frameParser = new FrameParser();
  private nextFrameId = 0;
  /** Chỉ bật polling (keepalive + OT config) sau khi leader gửi PING và ta đã trả ACK. */
  private leaderReady = false;

  private pendingFrames = new Map<
    number,
    {
      resolve: (result: { ack: boolean; data?: Buffer; errorCode?: number }) => void;
      timeoutId: ReturnType<typeof setTimeout>;
    }
  >();

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
    return this.lastThreadState;
  }

  getLastOtConfig(): OtConfig | null {
    return this.lastOtConfig;
  }

  getLastRouterTable(): TableData {
    return this.lastRouterTable;
  }

  getLastChildTable(): TableData {
    return this.lastChildTable;
  }

  getLastJoinerTable(): TableData {
    return this.lastJoinerTable;
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
    const payload = await this.fetchOtConfigPayload();
    this.lastOtConfig = payload;
    this.broadcast("ot:config", payload);
    return payload;
  }

  sendPullRequest(cmd: number, data?: Buffer): Promise<{ ack: boolean; data?: Buffer; errorCode?: number }> {
    return this.sendPullRequestInternal(cmd, data);
  }

  private stopAllPolling(): void {
    if (this.threadStateIntervalId != null) {
      clearInterval(this.threadStateIntervalId);
      this.threadStateIntervalId = null;
    }
    this.lastThreadState = null;

    if (this.otConfigIntervalId != null) {
      clearInterval(this.otConfigIntervalId);
      this.otConfigIntervalId = null;
    }
    this.lastOtConfig = null;

    if (this.dashboardTableChildTimeoutId != null) {
      clearTimeout(this.dashboardTableChildTimeoutId);
      this.dashboardTableChildTimeoutId = null;
    }
    if (this.dashboardTableIntervalId != null) {
      clearInterval(this.dashboardTableIntervalId);
      this.dashboardTableIntervalId = null;
    }
    this.lastRouterTable = null;
    this.lastChildTable = null;

    if (this.joinerTableIntervalId != null) {
      clearInterval(this.joinerTableIntervalId);
      this.joinerTableIntervalId = null;
    }
    this.lastJoinerTable = null;

    if (this.serialKeepaliveIntervalId != null) {
      clearInterval(this.serialKeepaliveIntervalId);
      this.serialKeepaliveIntervalId = null;
    }
  }

  private initializeSerialPort(config: {
    serialPort: string;
    baudRate: number;
    commandPrefix?: string;
  }): void {
    if (this.frameUnsubscribe) {
      this.frameUnsubscribe();
      this.frameUnsubscribe = null;
    }
    if (this.serialPort) {
      this.serialPort.close().catch((err) => console.error("[Serial]", err));
      this.serialPort = null;
    }
    this.clearPendingFrames();
    this.frameParser.reset();

    this.serialPort = new SerialPortService({
      path: config.serialPort,
      baudRate: config.baudRate,
    });

    this.serialPort.setOnDisconnect(() => this.onSerialDisconnected());

    this.frameUnsubscribe = this.serialPort.onRawData((chunk: Buffer) => {
      this.lastRawRxTime = Date.now();
      this.broadcast("serial:data", chunk.toString("hex"));
      this.frameParser.push(chunk, (frame) => this.handleParsedFrame(frame));
    });
    this.startRxWatchdog();
  }

  private startRxWatchdog(): void {
    this.clearRxWatchdog();
    this.lastRawRxTime = 0;
    this.rxWatchdogIntervalId = setInterval(() => {
      if (!this.serialPort?.getStatus().isConnected) return;
      if (this.lastRawRxTime === 0) return; // chưa nhận gì, không coi là mất kết nối
      if (Date.now() - this.lastRawRxTime <= NO_RX_WATCHDOG_MS) return;
      console.warn("[Serial] No RX for 20s (ESP reset / port chết?) — đóng và thử reconnect.");
      const port = this.serialPort;
      port.close().then(() => this.onSerialDisconnected()).catch(() => this.onSerialDisconnected());
    }, RX_WATCHDOG_CHECK_MS);
  }

  private clearRxWatchdog(): void {
    if (this.rxWatchdogIntervalId) {
      clearInterval(this.rxWatchdogIntervalId);
      this.rxWatchdogIntervalId = null;
    }
  }

  private clearPendingFrames(): void {
    for (const [, { timeoutId }] of this.pendingFrames) {
      clearTimeout(timeoutId);
    }
    this.pendingFrames.clear();
  }

  private logFrame(frame: ParsedFrame, direction: "RX"): void {
    const cmdName = CMD_NAMES[frame.cmd] ?? `0x${frame.cmd.toString(16)}`;
    const dataPreview =
      frame.data.length === 0
        ? "(empty)"
        : frame.data.length <= 64 && isMostlyPrintable(frame.data)
          ? frame.data.toString("utf8").replace(/\0/g, "\\0")
          : frame.data.toString("hex");
    console.log(
      `[Frame] ${direction} frameId=0x${frame.frameId.toString(16).padStart(2, "0")} cmd=0x${frame.cmd.toString(16).padStart(2, "0")} (${cmdName}) len=${frame.data.length} data=${dataPreview}`
    );
  }

  private handleParsedFrame(frame: ParsedFrame): void {
    this.logFrame(frame, "RX");

    if (frame.cmd === CMD.PING) {
      this.replyAckToPing(frame.frameId);
      // Tạm thời không bật polling để check ping — chỉ trả ACK, không gửi keepalive/pull config.
      // if (!this.leaderReady) {
      //   this.leaderReady = true;
      //   console.log("[Serial] Leader ready (PING received), replied ACK — starting polling.");
      //   this.startPollingIfEnabled();
      // }
      return;
    }
    if (frame.cmd === CMD.DATA) {
      this.handleCmdData(frame);
      return;
    }
    if (frame.cmd === CMD.ACK) {
      const pending = this.pendingFrames.get(frame.frameId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        this.pendingFrames.delete(frame.frameId);
        pending.resolve({ ack: true, data: frame.data.length > 0 ? frame.data : undefined });
      }
      this.applyAckDataToConfig(frame.data);
      return;
    }
    if (frame.cmd === CMD.NACK) {
      const pending = this.pendingFrames.get(frame.frameId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        this.pendingFrames.delete(frame.frameId);
        const errorCode = frame.data.length > 0 ? frame.data[0]! : 0;
        pending.resolve({ ack: false, errorCode });
      }
    }
  }

  /** Backend vừa kết nối → gửi PING để leader biết "dashboard đã vào", leader sẽ ping lại (hoặc trả ACK). */
  private sendPingToLeader(): void {
    if (!this.serialPort?.getStatus().isConnected) return;
    try {
      const frameId = this.nextFrameId;
      this.nextFrameId = (this.nextFrameId + 1) & 0xff;
      const pingFrame = buildFrame(frameId, CMD.PING, undefined);
      this.serialPort.writeRaw(pingFrame).catch((err) => console.warn("[Serial] Failed to send PING to leader:", err));
      console.log("[Frame] TX (connect) frameId=0x" + frameId.toString(16).padStart(2, "0") + " cmd=0x04 (PING) len=0 — báo leader ping lại.");
    } catch (err) {
      console.warn("[Serial] Failed to build PING for leader:", err);
    }
  }

  /** Leader gửi PING khi boot xong; backend trả ACK (cùng Frame ID) để leader biết đã sẵn sàng. */
  private replyAckToPing(frameId: number): void {
    if (!this.serialPort?.getStatus().isConnected) return;
    try {
      const ackFrame = buildFrame(frameId, CMD.ACK, undefined);
      this.serialPort.writeRaw(ackFrame).catch((err) => console.warn("[Serial] Failed to send ACK to PING:", err));
      console.log(`[Frame] TX (reply) frameId=0x${frameId.toString(16).padStart(2, "0")} cmd=0x02 (ACK) len=0`);
    } catch (err) {
      console.warn("[Serial] Failed to build ACK for PING:", err);
    }
  }

  private handleCmdData(frame: ParsedFrame): void {
    if (frame.data.length === 0) return;
    this.broadcast("serial:frame:data", { frameId: frame.frameId, dataHex: frame.data.toString("hex") });
  }

  private applyAckDataToConfig(data: Buffer): void {
    if (data.length === 0) return;
    const prev = this.lastOtConfig ?? {};
    if (data.length === 1 && data[0]! >= 11 && data[0]! <= 26) {
      this.lastOtConfig = { ...prev, channel: data[0]! };
      this.broadcast("ot:config", this.lastOtConfig);
    } else if (data.length === 2) {
      const panid = "0x" + data.readUInt16BE(0).toString(16).toUpperCase().padStart(4, "0");
      this.lastOtConfig = { ...prev, panid };
      this.broadcast("ot:config", this.lastOtConfig);
    } else if (data.length >= 1 && data.length <= 16) {
      const networkName = data.toString("utf8").replace(/\0/g, "");
      if (networkName) {
        this.lastOtConfig = { ...prev, networkName };
        this.broadcast("ot:config", this.lastOtConfig);
      }
    } else if (data.length === 16) {
      const ipaddr = Array.from(data)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(":");
      this.lastOtConfig = { ...prev, ipaddr };
      this.broadcast("ot:config", this.lastOtConfig);
    } else if (data.length > 0) {
      this.lastOtConfig = { ...prev, datasetActive: data.toString("hex") };
      this.broadcast("ot:config", this.lastOtConfig);
    }
  }

  private sendPullRequestInternal(
    cmd: number,
    data?: Buffer
  ): Promise<{ ack: boolean; data?: Buffer; errorCode?: number }> {
    return new Promise((resolve) => {
      const frameId = this.nextFrameId;
      this.nextFrameId = (this.nextFrameId + 1) & 0xff;

      const timeoutId = setTimeout(() => {
        if (this.pendingFrames.delete(frameId)) {
          resolve({ ack: false, errorCode: 0x03 });
        }
      }, FRAME_RESPONSE_TIMEOUT_MS);

      this.pendingFrames.set(frameId, { resolve, timeoutId });

      try {
        const frame = buildFrame(frameId, cmd, data);
        const cmdName = CMD_NAMES[cmd] ?? `0x${cmd.toString(16)}`;
        const dataLen = data?.length ?? 0;
        console.log(
          `[Frame] TX frameId=0x${frameId.toString(16).padStart(2, "0")} cmd=0x${cmd.toString(16).padStart(2, "0")} (${cmdName}) len=${dataLen}`
        );
        this.serialPort!.writeRaw(frame).catch(() => {
          if (this.pendingFrames.delete(frameId)) {
            clearTimeout(timeoutId);
            resolve({ ack: false, errorCode: 0x03 });
          }
        });
      } catch {
        if (this.pendingFrames.delete(frameId)) {
          clearTimeout(timeoutId);
          resolve({ ack: false, errorCode: 0x01 });
        }
      }
    });
  }

  private onSerialDisconnected(): void {
    this.leaderReady = false;
    this.clearRxWatchdog();
    this.stopAllPolling();
    this.frameUnsubscribe = null;
    this.clearPendingFrames();
    this.frameParser.reset();
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
    console.log(`[Serial] Will retry connection in ${RECONNECT_INTERVAL_MS}ms...`);
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
      this.lastRawRxTime = 0;
      this.broadcast("serial:connected", { success: true, status: this.serialPort!.getStatus() });
      this.broadcast("serial:status", this.serialPort!.getStatus());
      console.log("[Serial] Connected:", config.serialPort, "— gửi PING để leader ping lại.");
      this.sendPingToLeader();
    } catch (error) {
      console.error("[Serial] Connection failed:", error);
      this.broadcast("serial:status", { isConnected: false, path: config.serialPort, baudRate: config.baudRate });
      this.scheduleReconnect();
    }
  }

  private startPollingIfEnabled(): void {
    if (!this.serialPort?.getStatus().isConnected) return;
    this.startSerialKeepalive();
    this.startOtConfigPolling();
  }

  private runSerialKeepalive(): void {
    if (!this.serialPort?.getStatus().isConnected) return;
    this.sendPullRequestInternal(CMD.PING).catch(() => {});
  }

  private startSerialKeepalive(): void {
    if (this.serialKeepaliveIntervalId != null) return;
    if (!this.serialPort?.getStatus().isConnected) return;
    this.serialKeepaliveIntervalId = setInterval(() => {
      this.runSerialKeepalive();
    }, CommunicateManager.SERIAL_KEEPALIVE_MS);
    this.runSerialKeepalive();
  }

  private async fetchOtConfigPayload(): Promise<OtConfig> {
    if (!this.serialPort?.getStatus().isConnected) {
      return { error: "Serial not connected. Connect serial first." };
    }
    const base = { ...(this.lastOtConfig ?? {}) };
    const cmds = [
      CMD.NETWORK_NAME,
      CMD.PAN_ID,
      CMD.CHANNEL,
      CMD.DATASET_ACTIVE,
      CMD.IP_ADDR,
    ] as const;
    for (const cmd of cmds) {
      const res = await this.sendPullRequestInternal(cmd);
      if (res.ack && res.data && res.data.length > 0) {
        if (cmd === CMD.CHANNEL && res.data.length === 1) {
          base.channel = res.data[0];
        } else if (cmd === CMD.PAN_ID && res.data.length === 2) {
          base.panid = "0x" + res.data.readUInt16BE(0).toString(16).toUpperCase().padStart(4, "0");
        } else if (cmd === CMD.NETWORK_NAME && res.data.length <= 16) {
          base.networkName = res.data.toString("utf8").replace(/\0/g, "");
        } else if (cmd === CMD.IP_ADDR && res.data.length === 16) {
          base.ipaddr = Array.from(res.data)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(":");
        } else if (cmd === CMD.DATASET_ACTIVE) {
          base.datasetActive = res.data.toString("hex");
        }
      }
      if (!res.ack && res.errorCode != null) {
        base.error = NACK_MESSAGE[res.errorCode] ?? `Error 0x${res.errorCode.toString(16)}`;
      }
    }
    return base;
  }

  private async pollOtConfig(): Promise<void> {
    if (!this.serialPort?.getStatus().isConnected) return;
    try {
      const payload = await this.fetchOtConfigPayload();
      this.lastOtConfig = payload;
      this.broadcast("ot:config", payload);
    } catch (error) {
      this.lastOtConfig = { error: error instanceof Error ? error.message : "Unknown error" };
      this.broadcast("ot:config", this.lastOtConfig);
    }
  }

  private startOtConfigPolling(): void {
    if (this.otConfigIntervalId != null) return;
    if (!this.serialPort?.getStatus().isConnected) return;
    this.otConfigIntervalId = setInterval(() => {
      this.pollOtConfig();
    }, CommunicateManager.OT_CONFIG_POLL_MS);
    this.pollOtConfig();
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
