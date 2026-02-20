/**
 * PollingManager - Quản lý các interval poll (OT config, thread state, dashboard/joiner table).
 * Chứa logic fetch OT config và lên lịch poll; dữ liệu (lastOtConfig, ...) do CommunicateManager nắm.
 */

import { CMD, NACK_MESSAGE } from "./frame";

export type OtConfigPayload = {
  panid?: string;
  channel?: number;
  networkName?: string;
  ipaddr?: string;
  datasetActive?: string;
  error?: string;
};

export type SendPullRequest = (
  cmd: number,
  data?: Buffer
) => Promise<{ ack: boolean; data?: Buffer; errorCode?: number }>;

export class PollingManager {
  private threadStateIntervalId: ReturnType<typeof setInterval> | null = null;
  private otConfigIntervalId: ReturnType<typeof setInterval> | null = null;
  private dashboardTableIntervalId: ReturnType<typeof setInterval> | null = null;
  private dashboardTableChildTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private joinerTableIntervalId: ReturnType<typeof setInterval> | null = null;

  static readonly THREAD_STATE_POLL_MS = 4000;
  static readonly OT_CONFIG_POLL_MS = 6000;
  static readonly DASHBOARD_TABLE_POLL_MS = 6000;
  static readonly CHILD_TABLE_DELAY_MS = 1500;
  static readonly JOINER_TABLE_POLL_MS = 6000;

  /**
   * Fetch một lần OT config (dataset active, IP) qua sendRequest.
   */
  async fetchOtConfigPayload(
    sendRequest: SendPullRequest,
    getBaseConfig: () => OtConfigPayload
  ): Promise<OtConfigPayload> {
    const base = { ...getBaseConfig() };
    const cmds = [CMD.DATASET_ACTIVE, CMD.IP_ADDR] as const;
    for (const cmd of cmds) {
      const res = await sendRequest(cmd);
      if (res.ack && res.data && res.data.length > 0) {
        if (cmd === CMD.IP_ADDR && res.data.length === 16) {
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

  /**
   * Bật poll OT config: mỗi intervalMs gọi fetchOtConfigPayload(sendRequest, getBaseConfig), rồi onResult/onError.
   */
  startOtConfigPolling(
    intervalMs: number,
    sendRequest: SendPullRequest,
    getBaseConfig: () => OtConfigPayload,
    onResult: (data: OtConfigPayload) => void,
    onError?: (err: unknown) => void
  ): void {
    this.stopOtConfigPolling();
    const run = () => {
      this.fetchOtConfigPayload(sendRequest, getBaseConfig)
        .then(onResult)
        .catch((err) => onError?.(err));
    };
    this.otConfigIntervalId = setInterval(run, intervalMs);
    run();
  }

  stopOtConfigPolling(): void {
    if (this.otConfigIntervalId != null) {
      clearInterval(this.otConfigIntervalId);
      this.otConfigIntervalId = null;
    }
  }

  /** Dừng mọi interval (thread state, OT config, dashboard table, joiner table). */
  stopAll(): void {
    if (this.threadStateIntervalId != null) {
      clearInterval(this.threadStateIntervalId);
      this.threadStateIntervalId = null;
    }
    if (this.otConfigIntervalId != null) {
      clearInterval(this.otConfigIntervalId);
      this.otConfigIntervalId = null;
    }
    if (this.dashboardTableChildTimeoutId != null) {
      clearTimeout(this.dashboardTableChildTimeoutId);
      this.dashboardTableChildTimeoutId = null;
    }
    if (this.dashboardTableIntervalId != null) {
      clearInterval(this.dashboardTableIntervalId);
      this.dashboardTableIntervalId = null;
    }
    if (this.joinerTableIntervalId != null) {
      clearInterval(this.joinerTableIntervalId);
      this.joinerTableIntervalId = null;
    }
  }
}
