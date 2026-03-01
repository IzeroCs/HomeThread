/**
 * CommunicateManager - Khởi tạo và quản lý giao tiếp BR qua TCP (frame protocol).
 * Điều phối TransportTcp + frame; dữ liệu OT/Thread lưu ở OtConfigManager và ThreadDataManager.
 * Có thể đăng ký onBroadcast để push event (serial:data, serial:status, ot:config, ...) ra ngoài.
 */

import { BrConnectionConfigService } from "./BrConnectionConfigService";
import { TransportTcp } from "./TransportTcp";
import { CommandManager } from "./CommandManager";
import { OtConfigManager, type OtConfig } from "./OtConfigManager";
import { ThreadDataManager, type ThreadState, type TableData } from "./ThreadDataManager";
import { PollingManager } from "./PollingManager";
import { FrameParser, type ParsedFrame } from "./frame";
import { AppSettingsService } from "../services/AppSettingsService";
import { serialLogger } from "../utils/logger";
import { DEVICE_ROLE, DEVICE_ROLE_NAMES } from "../openthread/deviceRole";
import type { DeviceRole } from "../openthread/deviceRole";
import { EVENTS, type EventName } from "shared/src/events";
import type { ConnectionStatus } from "shared/src/types";
import { parseRouterTable, parseChildTable, parseJoinerTable } from "./frame";

export type { OtConfig } from "./OtConfigManager";
export type { ThreadState, TableData } from "./ThreadDataManager";
export type { ConnectionStatus };

const RECONNECT_INTERVAL_MS = 3000;
/** STATE 5 lần không có phản hồi (bất kỳ frame từ leader) thì đóng port và reconnect. */
const STATE_WITHOUT_RESPONSE_LIMIT = 5;

export type OnBroadcast = (event: EventName, data?: unknown) => void;

export class CommunicateManager {
  private brConnectionConfigService: BrConnectionConfigService;
  private appSettingsService: AppSettingsService;
  private onBroadcast: OnBroadcast | null = null;

  private transportTcp: TransportTcp | null = null;
  private frameUnsubscribe: (() => void) | null = null;
  private autoReconnectEnabled = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Số lần STATE liên tiếp không nhận được bất kỳ frame nào từ BR; đạt 5 thì đóng và reconnect. */
  private stateWithoutResponseCount = 0;

  private otConfigManager = new OtConfigManager();
  private threadDataManager = new ThreadDataManager();

  /** Số lượng frontend clients đang kết nối. Chỉ poll tables khi có frontend kết nối. */
  private frontendConnectionCount = 0;

  private pollingManager = new PollingManager({
    fetchRouterTable: () => this.fetchRouterTable(),
    fetchChildTable: () => this.fetchChildTable(),
    fetchJoinerTable: () => this.fetchJoinerTable(),
  });
  private stateIntervalId: ReturnType<typeof setInterval> | null = null;
  private static readonly STATE_INTERVAL_MS = 5000;

  private frameParser = new FrameParser();
  private commandManager: CommandManager | null = null;
  /** Chỉ bật polling (OT config) sau khi leader ready (ví dụ sau khi nhận phản hồi STATE). */
  private leaderReady = false;
  /** Role byte lần trước (để chỉ fetch ipaddr khi state đổi hoặc lần đầu). */
  private lastRoleByte: number | null = null;

  constructor(
    brConnectionConfigService: BrConnectionConfigService,
    appSettingsService: AppSettingsService,
    onBroadcast?: OnBroadcast
  ) {
    this.brConnectionConfigService = brConnectionConfigService;
    this.appSettingsService = appSettingsService;
    this.onBroadcast = onBroadcast ?? null;
  }

  setOnBroadcast(cb: OnBroadcast | null): void {
    this.onBroadcast = cb;
  }

  private broadcast(event: EventName, data?: unknown): void {
    this.onBroadcast?.(event, data);
  }

  getStatus(): ConnectionStatus {
    if (this.transportTcp) return this.transportTcp.getStatus();
    return { isConnected: false };
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

  /** Được gọi khi có frontend client kết nối. */
  onFrontendConnected(): void {
    this.frontendConnectionCount++;
    // Kiểm tra và start polling nếu state phù hợp
    const currentState = this.threadDataManager.getThreadState();
    if (currentState?.state === "leader" || currentState?.state === "router" || currentState?.state === "child") {
      this.updateTablesPolling(true);
    }
  }

  /** Được gọi khi frontend client ngắt kết nối. */
  onFrontendDisconnected(): void {
    if (this.frontendConnectionCount > 0) {
      this.frontendConnectionCount--;
    }
    // Nếu không còn frontend nào kết nối thì stop polling
    if (this.frontendConnectionCount === 0) {
      this.pollingManager.stopAll();
    }
  }

  /** Cập nhật polling tables dựa trên state và frontend connection. */
  private updateTablesPolling(isLeaderRouterOrChild: boolean): void {
    const hasFrontendConnection = this.frontendConnectionCount > 0;
    this.pollingManager.startTablesPolling(hasFrontendConnection, isLeaderRouterOrChild);
  }

  /** Fetch router table từ firmware. */
  async fetchRouterTable(): Promise<void> {
    if (!this.commandManager) return;
    try {
      const res = await this.commandManager.fetchRouterTable();
      if (res.ack && res.data) {
        const tableData = parseRouterTable(res.data);
        this.threadDataManager.setRouterTable(tableData);
        this.broadcast(EVENTS.OT_ROUTER_TABLE, tableData);
      }
    } catch (err) {
      serialLogger.warn(`fetchRouterTable failed: ${(err as Error)?.message ?? err}`);
      const errorData: TableData = { headers: [], rows: [], error: `Failed: ${(err as Error)?.message ?? err}` };
      this.threadDataManager.setRouterTable(errorData);
      this.broadcast(EVENTS.OT_ROUTER_TABLE, errorData);
    }
  }

  /** Fetch child table từ firmware. */
  async fetchChildTable(): Promise<void> {
    if (!this.commandManager) return;
    try {
      const res = await this.commandManager.fetchChildTable();
      if (res.ack && res.data) {
        const tableData = parseChildTable(res.data);
        this.threadDataManager.setChildTable(tableData);
        this.broadcast(EVENTS.OT_CHILD_TABLE, tableData);
      }
    } catch (err) {
      serialLogger.warn(`fetchChildTable failed: ${(err as Error)?.message ?? err}`);
      const errorData: TableData = { headers: [], rows: [], error: `Failed: ${(err as Error)?.message ?? err}` };
      this.threadDataManager.setChildTable(errorData);
      this.broadcast(EVENTS.OT_CHILD_TABLE, errorData);
    }
  }

  /** Fetch joiner table từ firmware. */
  async fetchJoinerTable(): Promise<void> {
    if (!this.commandManager) return;
    try {
      const res = await this.commandManager.fetchJoinerTable();
      if (res.ack && res.data) {
        const tableData = parseJoinerTable(res.data);
        this.threadDataManager.setJoinerTable(tableData);
        this.broadcast(EVENTS.OT_JOINER_TABLE, tableData);
      }
    } catch (err) {
      serialLogger.warn(`fetchJoinerTable failed: ${(err as Error)?.message ?? err}`);
      const errorData: TableData = { headers: [], rows: [], error: `Failed: ${(err as Error)?.message ?? err}` };
      this.threadDataManager.setJoinerTable(errorData);
      this.broadcast(EVENTS.OT_JOINER_TABLE, errorData);
    }
  }

  async connect(): Promise<void> {
    this.autoReconnectEnabled = true;
    await this.connectInternal();
  }

  async disconnect(): Promise<void> {
    this.autoReconnectEnabled = false;
    this.clearReconnectTimer();
    this.stopAllPolling();
    if (this.transportTcp) {
      await this.transportTcp.close();
      this.transportTcp = null;
      this.frameUnsubscribe = null;
      this.clearPendingFrames();
      this.frameParser.reset();
      this.broadcast(EVENTS.SERIAL_STATUS, { isConnected: false });
    }
  }

  async connectIfConfigured(): Promise<void> {
    await this.connectInternal();
  }

  async resetTransport(): Promise<void> {
    this.clearReconnectTimer();
    if (this.frameUnsubscribe) {
      this.frameUnsubscribe();
      this.frameUnsubscribe = null;
    }
    this.clearPendingFrames();
    this.frameParser.reset();
    if (this.transportTcp) {
      await this.transportTcp.close();
      this.transportTcp = null;
      this.broadcast(EVENTS.SERIAL_STATUS, { isConnected: false });
    }
  }

  async testConnection(host: string, port: number): Promise<{ success: boolean; error?: string }> {
    const status = this.transportTcp?.getStatus();
    if (status?.isConnected && status.host === host && status.port === port) {
      return { success: true };
    }
    const temp = new TransportTcp();
    try {
      await temp.open({ host, port });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    } finally {
      await temp.close();
    }
  }

  /** Fetch một lần OT config (dataset active + IP). Gọi khi cần (vd. frontend refresh); dataset+IP còn được gọi khi state đổi / lần đầu có ACK state trong pullState. */
  async fetchOtConfig(): Promise<OtConfig> {
    if (!this.transportTcp?.getStatus().isConnected) {
      return { error: "BR not connected. Connect to BR first." };
    }
    // Dataset active: fetch khi được gọi từ frontend (manual refresh)
    // Lưu ý: trong pullState, dataset active chỉ fetch khi state thay đổi
    await this.commandManager!.fetchDatasetActive();
    // IP addr chỉ fetch khi state là leader/router/child
    const currentState = this.threadDataManager.getThreadState();
    if (currentState?.state) {
      const stateName = currentState.state;
      const isLeaderRouterOrChild =
        stateName === DEVICE_ROLE_NAMES[DEVICE_ROLE.LEADER] ||
        stateName === DEVICE_ROLE_NAMES[DEVICE_ROLE.ROUTER] ||
        stateName === DEVICE_ROLE_NAMES[DEVICE_ROLE.CHILD];
      if (isLeaderRouterOrChild) {
        await this.commandManager!.fetchIpAddr();
      }
    }
    const payload = this.otConfigManager.get();
    this.broadcast(EVENTS.OT_CONFIG, payload ?? {});
    return payload ?? {};
  }

  sendPullRequest(cmd: number, data?: Buffer): Promise<{ ack: boolean; data?: Buffer; errorCode?: number }> {
    return this.sendPullRequestInternal(cmd, data);
  }

  /** Set PAN ID qua frame protocol. */
  async setPanid(panid: string): Promise<{ ack: boolean; errorCode?: number }> {
    if (!this.commandManager) {
      return { ack: false, errorCode: 0x02 }; // NOT_READY
    }
    const result = await this.commandManager.setPanid(panid);
    return { ack: result.ack, errorCode: result.errorCode };
  }

  /** Set Channel qua frame protocol. */
  async setChannel(channel: number): Promise<{ ack: boolean; errorCode?: number }> {
    if (!this.commandManager) {
      return { ack: false, errorCode: 0x02 }; // NOT_READY
    }
    const result = await this.commandManager.setChannel(channel);
    return { ack: result.ack, errorCode: result.errorCode };
  }

  /** Set Network Name qua frame protocol. */
  async setNetworkName(networkName: string): Promise<{ ack: boolean; errorCode?: number }> {
    if (!this.commandManager) {
      return { ack: false, errorCode: 0x02 }; // NOT_READY
    }
    const result = await this.commandManager.setNetworkName(networkName);
    return { ack: result.ack, errorCode: result.errorCode };
  }

  /** Set Extended PAN ID qua frame protocol. */
  async setExtendedPanid(extendedPanId: string): Promise<{ ack: boolean; errorCode?: number }> {
    if (!this.commandManager) {
      return { ack: false, errorCode: 0x02 }; // NOT_READY
    }
    const result = await this.commandManager.setExtendedPanid(extendedPanId);
    return { ack: result.ack, errorCode: result.errorCode };
  }

  /** Set Network Key qua frame protocol. */
  async setNetworkKey(networkKey: string): Promise<{ ack: boolean; errorCode?: number }> {
    if (!this.commandManager) {
      return { ack: false, errorCode: 0x02 }; // NOT_READY
    }
    const result = await this.commandManager.setNetworkKey(networkKey);
    return { ack: result.ack, errorCode: result.errorCode };
  }

  /** Gửi CMD_RESET để reset thiết bị. */
  async reset(): Promise<{ ack: boolean; errorCode?: number }> {
    if (!this.commandManager) {
      return { ack: false, errorCode: 0x02 }; // NOT_READY
    }
    const result = await this.commandManager.reset();
    return { ack: result.ack, errorCode: result.errorCode };
  }

  /** Gửi CMD_FACTORY để factory reset thiết bị (confirm byte 0xAA). */
  async factoryReset(): Promise<{ ack: boolean; errorCode?: number }> {
    if (!this.commandManager) {
      return { ack: false, errorCode: 0x02 }; // NOT_READY
    }
    const result = await this.commandManager.factoryReset();
    return { ack: result.ack, errorCode: result.errorCode };
  }

  /** Start Thread qua frame protocol. */
  async startThread(): Promise<{ ack: boolean; errorCode?: number }> {
    if (!this.commandManager) {
      return { ack: false, errorCode: 0x02 }; // NOT_READY
    }
    const result = await this.commandManager.startThread();
    return { ack: result.ack, errorCode: result.errorCode };
  }

  /** Stop Thread qua frame protocol. */
  async stopThread(): Promise<{ ack: boolean; errorCode?: number }> {
    if (!this.commandManager) {
      return { ack: false, errorCode: 0x02 }; // NOT_READY
    }
    const result = await this.commandManager.stopThread();
    return { ack: result.ack, errorCode: result.errorCode };
  }

  /** Gửi CMD_THREAD_VERSION, nhận ACK (data = version string/bytes tùy firmware). */
  async getThreadVersion(): Promise<{ ack: boolean; data?: Buffer; errorCode?: number }> {
    if (!this.commandManager) {
      return { ack: false, errorCode: 0x02 }; // NOT_READY
    }
    const result = await this.commandManager.getThreadVersion();
    return { ack: result.ack, data: result.data, errorCode: result.errorCode };
  }

  /** Gửi CMD_COMMISSIONER_JOINER để thêm joiner vào commissioner. */
  async commissionerJoiner(
    eui64: string,
    pskd: string,
    timeoutSeconds: number
  ): Promise<{ ack: boolean; errorCode?: number }> {
    if (!this.commandManager) {
      return { ack: false, errorCode: 0x02 }; // NOT_READY
    }
    const result = await this.commandManager.commissionerJoiner(eui64, pskd, timeoutSeconds);
    return { ack: result.ack, errorCode: result.errorCode };
  }

  private stopAllPolling(): void {
    this.pollingManager.stopAll();
    this.threadDataManager.clear();
    this.otConfigManager.clear();
    if (this.stateIntervalId != null) {
      clearInterval(this.stateIntervalId);
      this.stateIntervalId = null;
    }
  }

  private initializeTransportTcp(config: { brHost: string; brPort: number }): void {
    if (this.frameUnsubscribe) {
      this.frameUnsubscribe();
      this.frameUnsubscribe = null;
    }
    if (this.transportTcp) {
      this.transportTcp.close().catch((err) => serialLogger.error(String(err?.message ?? err)));
      this.transportTcp = null;
    }
    this.clearPendingFrames();
    this.frameParser.reset();

    this.transportTcp = new TransportTcp();

    this.commandManager = new CommandManager({
      writeRaw: (buf) => this.transportTcp!.writeRaw(buf),
      broadcast: (event, data) => this.broadcast(event, data),
      onAckDataToConfig: (partial) => {
        this.otConfigManager.update(partial);
        this.broadcast(EVENTS.OT_CONFIG, this.otConfigManager.get());
      },
    });

    this.transportTcp.setOnDisconnect(() => this.onTransportDisconnected());

    this.frameUnsubscribe = this.transportTcp.onRawData((chunk: Buffer) => {
      this.broadcast(EVENTS.SERIAL_DATA, chunk.toString("hex"));
      this.frameParser.push(
        chunk,
        (frame: ParsedFrame) => {
          this.stateWithoutResponseCount = 0;
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

  /** Bật pull state định kỳ (ngay 1 lần + mỗi STATE_INTERVAL_MS). Backend tự gửi CMD_STATE, nhận ACK (1 byte role) rồi cập nhật thread state + fetch ipaddr nếu cần. */
  private startStateInterval(): void {
    if (this.stateIntervalId != null) return;
    if (!this.transportTcp?.getStatus().isConnected) return;
    this.pullState();
    this.stateIntervalId = setInterval(() => {
      this.pullState();
    }, CommunicateManager.STATE_INTERVAL_MS);
  }

  /** Pull state: gửi CMD_STATE, nhận ACK (1 byte role). Cập nhật thread state, reset đếm; nếu state thay đổi thì fetch dataset active (trước), nếu leader/router/child thì fetch ipaddr. Thất bại thì tăng đếm, đủ 5 lần thì đóng và reconnect. */
  private pullState(): void {
    if (!this.transportTcp?.getStatus().isConnected || !this.commandManager) return;
    if (this.stateWithoutResponseCount >= STATE_WITHOUT_RESPONSE_LIMIT) {
      serialLogger.warn("STATE " + STATE_WITHOUT_RESPONSE_LIMIT + " lần không có phản hồi — đóng và reconnect.");
      const transport = this.transportTcp;
      transport.close().then(() => this.onTransportDisconnected()).catch(() => this.onTransportDisconnected());
      return;
    }

    const cmdMgr = this.commandManager;
    cmdMgr
      .fetchState()
      .then((res) => {
        if (res.ack && res.data && res.data.length >= 1) {
          this.stateWithoutResponseCount = 0;
          const roleByte = res.data[0]! as DeviceRole;
          const stateName = DEVICE_ROLE_NAMES[roleByte] ?? "unknown";
          const stateChangedOrFirst = this.lastRoleByte === null || this.lastRoleByte !== roleByte;
          this.lastRoleByte = roleByte;

          this.threadDataManager.setThreadState({ running: true, state: stateName });
          this.broadcast(EVENTS.OT_THREAD_STATE, this.threadDataManager.getThreadState());

          // Dataset active: chỉ fetch khi state thay đổi (hoặc lần đầu nhận ACK), không phụ thuộc state là gì
          if (stateChangedOrFirst) {
            cmdMgr.fetchDatasetActive().catch(() => {});
          }

          // Thread version: chỉ fetch một lần khi chưa có version trong config
          if (this.otConfigManager.get()?.threadVersion == null) {
            this.getThreadVersion()
              .then((versionRes) => {
                if (versionRes.ack && versionRes.data && versionRes.data.length > 0) {
                  // Firmware có thể trả về: 2 bytes uint16 big-endian (e.g. 0x0004 = "4") hoặc ASCII string
                  let version: string;
                  if (versionRes.data.length <= 2) {
                    // Interpret as uint16 big-endian (e.g. Thread version 1.3 = 4)
                    version = versionRes.data.readUIntBE(0, versionRes.data.length).toString();
                  } else {
                    version = versionRes.data.toString("utf8").replace(/\0/g, "").trim();
                  }
                  this.otConfigManager.update({ threadVersion: version });
                  this.broadcast(EVENTS.OT_CONFIG, this.otConfigManager.get());
                }
              })
              .catch((err) => serialLogger.warn(`getThreadVersion failed: ${(err as Error)?.message ?? err}`));
          }

          // Auto-start Thread: khi state vừa đổi sang disabled và thread_run_on_connect bật
          if (stateChangedOrFirst && roleByte === DEVICE_ROLE.DISABLED && this.appSettingsService.getThreadRunOnConnect()) {
            this.startThread()
              .then((result) => {
                if (result.ack) {
                  serialLogger.info("Auto-started Thread (thread_run_on_connect=true, state was disabled)");
                } else {
                  serialLogger.warn(`Auto-start Thread failed: errorCode=${result.errorCode}`);
                }
              })
              .catch((err) => serialLogger.warn(`Auto-start Thread error: ${(err as Error)?.message ?? err}`));
          }

          // IP addr: chỉ fetch khi state là leader/router/child và state đổi hoặc lần đầu
          const isLeaderRouterOrChild =
            roleByte === DEVICE_ROLE.LEADER ||
            roleByte === DEVICE_ROLE.ROUTER ||
            roleByte === DEVICE_ROLE.CHILD;
          if (isLeaderRouterOrChild && stateChangedOrFirst) {
            cmdMgr
              .fetchIpAddr()
              .then((ipRes) => {
                if (ipRes.ack && ipRes.data?.length === 16 && ipRes.frameId != null) {
                  cmdMgr.replyAck(ipRes.frameId);
                }
              })
              .catch((err) =>
                serialLogger.warn(`fetchIpAddr failed: ${(err as Error)?.message ?? err}`)
              );
          }

          // Start/stop polling tables dựa trên state và frontend connection
          this.updateTablesPolling(isLeaderRouterOrChild);
        } else {
          this.stateWithoutResponseCount++;
        }
      })
      .catch(() => {
        this.stateWithoutResponseCount++;
      });
  }

  private sendPullRequestInternal(
    cmd: number,
    data?: Buffer
  ): Promise<{ ack: boolean; data?: Buffer; errorCode?: number }> {
    return this.commandManager!.sendRequest(cmd, data);
  }

  private onTransportDisconnected(): void {
    this.leaderReady = false;
    this.lastRoleByte = null;
    this.stateWithoutResponseCount = 0;
    this.stopAllPolling();
    this.frameUnsubscribe = null;
    this.clearPendingFrames();
    this.frameParser.reset();
    this.commandManager = null;
    this.transportTcp = null;
    this.broadcast(EVENTS.SERIAL_STATUS, { isConnected: false });
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
    const config = this.brConnectionConfigService.getLatest();
    if (!config) return;
    serialLogger.info(`Will retry BR connection in ${RECONNECT_INTERVAL_MS}ms...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectInternal();
    }, RECONNECT_INTERVAL_MS);
  }

  private async connectInternal(): Promise<void> {
    const config = this.brConnectionConfigService.getLatest();
    if (!config) return;
    try {
      if (!this.transportTcp) {
        this.initializeTransportTcp({ brHost: config.brHost, brPort: config.brPort });
      }
      await this.transportTcp!.open({ host: config.brHost, port: config.brPort });

      this.clearReconnectTimer();
      this.stateWithoutResponseCount = 0;
      const status = this.transportTcp!.getStatus();
      this.broadcast(EVENTS.SERIAL_CONNECTED, { success: true, status });
      this.broadcast(EVENTS.SERIAL_STATUS, status);
      serialLogger.info(`Connected to BR: ${config.brHost}:${config.brPort}`);
      this.startStateInterval();
    } catch (error) {
      serialLogger.error(`BR connection failed: ${error}`);
      this.broadcast(EVENTS.SERIAL_STATUS, { isConnected: false, host: config.brHost, port: config.brPort });
      this.scheduleReconnect();
    }
  }

  /** Đóng toàn bộ: dừng polling, clear pending frames, đóng TCP. Dùng khi disconnect từ frontend. */
  async close(): Promise<void> {
    this.autoReconnectEnabled = false;
    this.clearReconnectTimer();
    if (this.frameUnsubscribe) {
      this.frameUnsubscribe();
      this.frameUnsubscribe = null;
    }
    this.clearPendingFrames();
    this.frameParser.reset();
    if (this.transportTcp) {
      await this.transportTcp.close();
      this.transportTcp = null;
    }
  }

  /** Shutdown khi server tắt: dừng polling, clear pending frames, bỏ listener — KHÔNG đóng TCP để BR tiếp tục chạy. */
  shutdown(): void {
    this.autoReconnectEnabled = false;
    this.clearReconnectTimer();
    this.stopAllPolling();
    this.clearPendingFrames();
    if (this.frameUnsubscribe) {
      this.frameUnsubscribe();
      this.frameUnsubscribe = null;
    }
    this.frameParser.reset();
    serialLogger.info("Server shutdown: BR connection left open.");
  }
}
