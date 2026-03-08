/**
 * OtbrManager - Điều phối OTBR qua REST API.
 * Quản lý kết nối, state, config, tables; đăng ký onBroadcast để push event ra WebSocket.
 */

import { OtbrRestClient } from "./otbr-rest-client";
import { OtConfigManager, type OtConfig } from "./ot-config.manager";
import { ThreadDataManager, type ThreadState, type TableData } from "./thread-data.manager";
import { PollingManager } from "./polling.manager";
import { AppSettingsService } from "../services/app-settings.service";
import { logger } from "../utils/logger.util";
import { EVENTS, type EventName } from "shared/src/events";
import type { ConnectionStatus } from "shared/src/types";

export type { OtConfig } from "./ot-config.manager";
export type { ThreadState, TableData } from "./thread-data.manager";
export type { ConnectionStatus };

const RECONNECT_INTERVAL_MS = 5000;

const log = logger.child("OtbrManager");
const otbrLog = logger.child("OtbrConnection");

export type OnBroadcast = (event: EventName, data?: unknown) => void;

export class OtbrManager {
  private appSettingsService: AppSettingsService;
  private onBroadcast: OnBroadcast | null = null;

  private otbrClient = new OtbrRestClient();
  private autoReconnectEnabled = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private otConfigManager = new OtConfigManager();
  private threadDataManager = new ThreadDataManager();

  private frontendConnectionCount = 0;

  private pollingManager = new PollingManager({
    fetchRouterTable: () => this.fetchRouterTable(),
    fetchChildTable: () => this.fetchChildTable(),
    fetchJoinerTable: () => this.fetchJoinerTable(),
  });
  private stateIntervalId: ReturnType<typeof setInterval> | null = null;
  private static readonly STATE_FALLBACK_INTERVAL_MS = 30000;

  constructor(appSettingsService: AppSettingsService, onBroadcast?: OnBroadcast) {
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
    return { isConnected: this.otbrClient.isConnected() };
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

  onFrontendConnected(): void {
    this.frontendConnectionCount++;
    const currentState = this.threadDataManager.getThreadState();
    if (currentState?.state === "leader" || currentState?.state === "router" || currentState?.state === "child") {
      this.updateTablesPolling(true);
    }
  }

  onFrontendDisconnected(): void {
    if (this.frontendConnectionCount > 0) this.frontendConnectionCount--;
    if (this.frontendConnectionCount === 0) this.pollingManager.stopAll();
  }

  private updateTablesPolling(isLeaderRouterOrChild: boolean): void {
    this.pollingManager.startTablesPolling(this.frontendConnectionCount > 0, isLeaderRouterOrChild);
  }

  async fetchRouterTable(): Promise<void> {
    try {
      const tableData = await this.otbrClient.getRouterTable();
      this.threadDataManager.setRouterTable(tableData);
      this.broadcast(EVENTS.OT_ROUTER_TABLE, tableData);
    } catch (err) {
      log.warn(`fetchRouterTable failed: ${(err as Error)?.message ?? err}`);
      const errData: TableData = { headers: [], rows: [], error: (err as Error)?.message ?? "Failed" };
      this.threadDataManager.setRouterTable(errData);
      this.broadcast(EVENTS.OT_ROUTER_TABLE, errData);
    }
  }

  async fetchChildTable(): Promise<void> {
    try {
      const tableData = await this.otbrClient.getChildTable();
      this.threadDataManager.setChildTable(tableData);
      this.broadcast(EVENTS.OT_CHILD_TABLE, tableData);
    } catch (err) {
      log.warn(`fetchChildTable failed: ${(err as Error)?.message ?? err}`);
      const errData: TableData = { headers: [], rows: [], error: (err as Error)?.message ?? "Failed" };
      this.threadDataManager.setChildTable(errData);
      this.broadcast(EVENTS.OT_CHILD_TABLE, errData);
    }
  }

  async fetchJoinerTable(): Promise<void> {
    try {
      const tableData = await this.otbrClient.getJoinerTable();
      this.threadDataManager.setJoinerTable(tableData);
      this.broadcast(EVENTS.OT_JOINER_TABLE, tableData);
    } catch (err) {
      log.warn(`fetchJoinerTable failed: ${(err as Error)?.message ?? err}`);
      const errData: TableData = { headers: [], rows: [], error: (err as Error)?.message ?? "Failed" };
      this.threadDataManager.setJoinerTable(errData);
      this.broadcast(EVENTS.OT_JOINER_TABLE, errData);
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
    await this.otbrClient.close();
    this.broadcast(EVENTS.SERIAL_STATUS, { isConnected: false });
  }

  async connectIfConfigured(): Promise<void> {
    await this.connectInternal();
  }

  async resetTransport(): Promise<void> {
    this.clearReconnectTimer();
    await this.otbrClient.close();
    this.broadcast(EVENTS.SERIAL_STATUS, { isConnected: false });
  }

  async testOtbrConnection(): Promise<boolean> {
    return this.otbrClient.isAvailable();
  }

  async testConnection(_host: string, _port: number): Promise<{ success: boolean; error?: string }> {
    try {
      const ok = await this.otbrClient.isAvailable();
      return ok ? { success: true } : { success: false, error: "OTBR not available via REST" };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }

  async fetchOtConfig(): Promise<OtConfig> {
    if (!this.otbrClient.isConnected()) {
      return { error: "OTBR not connected. Connect to OTBR first." };
    }
    try {
      const config = await this.otbrClient.getActiveDataset();
      if (config) {
        this.otConfigManager.set(config);
        this.broadcast(EVENTS.OT_CONFIG, config);
        return config;
      }
    } catch (err) {
      log.warn(`fetchOtConfig failed: ${(err as Error)?.message ?? err}`);
    }
    const payload = this.otConfigManager.get();
    this.broadcast(EVENTS.OT_CONFIG, payload ?? {});
    return payload ?? {};
  }

  async setPanid(panid: string): Promise<{ ack: boolean; errorCode?: number }> {
    return this.otbrClient.setActiveDataset(this.buildPanIdTlv(panid)).catch(() => ({ ack: false, errorCode: 0x03 }));
  }

  async setChannel(channel: number): Promise<{ ack: boolean; errorCode?: number }> {
    return this.otbrClient.setActiveDataset(this.buildChannelTlv(channel)).catch(() => ({ ack: false, errorCode: 0x03 }));
  }

  async setNetworkName(networkName: string): Promise<{ ack: boolean; errorCode?: number }> {
    return this.otbrClient.setActiveDataset(this.buildNetworkNameTlv(networkName)).catch(() => ({ ack: false, errorCode: 0x03 }));
  }

  async setExtendedPanid(extendedPanId: string): Promise<{ ack: boolean; errorCode?: number }> {
    return this.otbrClient.setActiveDataset(this.buildExtendedPanIdTlv(extendedPanId)).catch(() => ({ ack: false, errorCode: 0x03 }));
  }

  async setNetworkKey(networkKey: string): Promise<{ ack: boolean; errorCode?: number }> {
    return this.otbrClient.setActiveDataset(this.buildNetworkKeyTlv(networkKey)).catch(() => ({ ack: false, errorCode: 0x03 }));
  }

  private buildPanIdTlv(panid: string): string {
    const hex = panid.replace(/^0x/i, "").padStart(4, "0").slice(-4);
    return "0102" + hex;
  }

  private buildChannelTlv(channel: number): string {
    const b = Buffer.alloc(3);
    b[0] = 0;
    b.writeUInt16BE(channel, 1);
    return "0003" + b.toString("hex");
  }

  private buildNetworkNameTlv(name: string): string {
    const buf = Buffer.from(name.slice(0, 16), "utf8");
    return "03" + buf.length.toString(16).padStart(2, "0") + buf.toString("hex");
  }

  private buildExtendedPanIdTlv(hex: string): string {
    const clean = hex.replace(/[^0-9a-fA-F]/g, "").slice(0, 16).padStart(16, "0");
    return "0208" + clean;
  }

  private buildNetworkKeyTlv(hex: string): string {
    const clean = hex.replace(/[^0-9a-fA-F]/g, "").slice(0, 32).padStart(32, "0");
    return "0510" + clean;
  }

  async reset(): Promise<{ ack: boolean; errorCode?: number }> {
    return this.otbrClient.reset();
  }

  async factoryReset(): Promise<{ ack: boolean; errorCode?: number }> {
    return this.otbrClient.factoryReset();
  }

  async startThread(): Promise<{ ack: boolean; errorCode?: number }> {
    return this.otbrClient.attach();
  }

  async stopThread(): Promise<{ ack: boolean; errorCode?: number }> {
    return this.otbrClient.detach();
  }

  async getThreadVersion(): Promise<{ ack: boolean; data?: Buffer; errorCode?: number }> {
    return { ack: false, errorCode: 0x01 };
  }

  async commissionerJoiner(
    eui64: string,
    pskd: string,
    timeoutSeconds: number
  ): Promise<{ ack: boolean; errorCode?: number }> {
    return this.otbrClient.addJoiner(eui64, pskd, timeoutSeconds);
  }

  async srpRegister(
    _hostname: string,
    _backendIPv6: string,
    _port: number
  ): Promise<{ ack: boolean; errorCode?: number }> {
    return { ack: true };
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

  private startStateInterval(): void {
    if (this.stateIntervalId != null) return;
    this.pullStateOtbr();
    this.stateIntervalId = setInterval(() => this.pullStateOtbr(), OtbrManager.STATE_FALLBACK_INTERVAL_MS);
  }

  private pullStateOtbr(): void {
    if (!this.otbrClient.isConnected()) return;
    this.otbrClient
      .getState()
      .then((state) => {
        if (!state) return;
        this.threadDataManager.setThreadState({ running: state.running, state: state.state });
        this.broadcast(EVENTS.OT_THREAD_STATE, this.threadDataManager.getThreadState());
        const isLeaderRouterOrChild =
          state.state === "leader" || state.state === "router" || state.state === "child";
        this.updateTablesPolling(isLeaderRouterOrChild);
        if (state.state === "disabled" && this.appSettingsService.getThreadRunOnConnect()) {
          this.startThread()
            .then((r) => r.ack && log.info("Auto-started Thread (thread_run_on_connect=true)."))
            .catch((err) => log.warn(`Auto-start Thread: ${(err as Error)?.message ?? err}`));
        }
      })
      .catch(() => {});
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer != null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    if (!this.autoReconnectEnabled) return;
    otbrLog.info(`Will retry OTBR connection in ${RECONNECT_INTERVAL_MS}ms...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectInternal();
    }, RECONNECT_INTERVAL_MS);
  }

  private async connectInternal(): Promise<void> {
    try {
      const available = await this.otbrClient.isAvailable();
      if (available) {
        this.clearReconnectTimer();
        this.broadcast(EVENTS.SERIAL_CONNECTED, { success: true, status: this.getStatus() });
        this.broadcast(EVENTS.SERIAL_STATUS, this.getStatus());
        otbrLog.info("Connected to OTBR via REST");
        this.startStateInterval();
      } else {
        this.broadcast(EVENTS.SERIAL_STATUS, { isConnected: false });
        this.scheduleReconnect();
      }
    } catch (error) {
      otbrLog.error(`OTBR connection failed: ${error}`);
      this.broadcast(EVENTS.SERIAL_STATUS, { isConnected: false });
      this.scheduleReconnect();
    }
  }

  async close(): Promise<void> {
    this.autoReconnectEnabled = false;
    this.clearReconnectTimer();
    this.stopAllPolling();
    await this.otbrClient.close();
  }

  shutdown(): void {
    this.autoReconnectEnabled = false;
    this.clearReconnectTimer();
    this.stopAllPolling();
    otbrLog.info("Server shutdown: OTBR connection left open.");
  }
}
