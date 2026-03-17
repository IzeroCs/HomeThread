/**
 * ThreadPolling - Quản lý các interval poll (router table, child table, joiner list).
 * Thread state và OT config (dataset, ipaddr) do BR layer xử lý (pullState / khi state đổi).
 */

import type { RouterEntry, ChildEntry } from "@communicate/frame";

export interface ThreadPollingCallbacks {
  fetchRouterTable: () => Promise<void | RouterEntry[] | null>;
  fetchChildTable: () => Promise<void | ChildEntry[] | null>;
  fetchJoinerTable: () => Promise<void>;
}

export class ThreadPolling {
  private routerTableIntervalId: ReturnType<typeof setInterval> | null = null;
  private childTableDelayTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private childTableIntervalId: ReturnType<typeof setInterval> | null = null;
  private joinerTableIntervalId: ReturnType<typeof setInterval> | null = null;

  /** Fallback polling only (notify-first). */
  static readonly ROUTER_TABLE_POLL_MS = 30000;
  static readonly CHILD_TABLE_DELAY_MS = 1500;
  /** Fallback polling only (notify-first). */
  static readonly CHILD_TABLE_POLL_MS = 30000;
  /** Fallback polling only (notify-first). */
  static readonly JOINER_TABLE_POLL_MS = 30000;

  constructor(private callbacks: ThreadPollingCallbacks) {}

  /**
   * Bật polling các table khi state là child/router/leader và có frontend kết nối.
   * Chỉ poll khi cả hai điều kiện đều thỏa mãn.
   */
  startTablesPolling(hasFrontendConnection: boolean, isLeaderRouterOrChild: boolean): void {
    if (!hasFrontendConnection || !isLeaderRouterOrChild) {
      this.stopAll();
      return;
    }

    // Router Table: poll định kỳ
    if (this.routerTableIntervalId == null) {
      this.callbacks.fetchRouterTable().catch(() => {});
      this.routerTableIntervalId = setInterval(() => {
        this.callbacks.fetchRouterTable().catch(() => {});
      }, ThreadPolling.ROUTER_TABLE_POLL_MS);
    }

    // Child Table: delay một chút rồi poll định kỳ
    if (this.childTableDelayTimeoutId == null && this.childTableIntervalId == null) {
      this.childTableDelayTimeoutId = setTimeout(() => {
        this.childTableDelayTimeoutId = null;
        this.callbacks.fetchChildTable().catch(() => {});
        // Sau delay đầu tiên, poll định kỳ
        if (this.childTableIntervalId == null) {
          this.childTableIntervalId = setInterval(() => {
            this.callbacks.fetchChildTable().catch(() => {});
          }, ThreadPolling.CHILD_TABLE_POLL_MS);
        }
      }, ThreadPolling.CHILD_TABLE_DELAY_MS);
    }

    // Joiner Table: poll định kỳ (chỉ khi leader)
    // Note: Cần check state là leader riêng, nhưng tạm để đây
    if (this.joinerTableIntervalId == null) {
      this.callbacks.fetchJoinerTable().catch(() => {});
      this.joinerTableIntervalId = setInterval(() => {
        this.callbacks.fetchJoinerTable().catch(() => {});
      }, ThreadPolling.JOINER_TABLE_POLL_MS);
    }
  }

  /** Dừng mọi interval (router table, child table, joiner table). */
  stopAll(): void {
    if (this.childTableDelayTimeoutId != null) {
      clearTimeout(this.childTableDelayTimeoutId);
      this.childTableDelayTimeoutId = null;
    }
    if (this.childTableIntervalId != null) {
      clearInterval(this.childTableIntervalId);
      this.childTableIntervalId = null;
    }
    if (this.routerTableIntervalId != null) {
      clearInterval(this.routerTableIntervalId);
      this.routerTableIntervalId = null;
    }
    if (this.joinerTableIntervalId != null) {
      clearInterval(this.joinerTableIntervalId);
      this.joinerTableIntervalId = null;
    }
  }
}
