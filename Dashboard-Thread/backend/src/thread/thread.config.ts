/**
 * OtConfig - Quản lý và lưu dữ liệu OT config (panid, channel, networkName, ...).
 * Cập nhật qua set() (thay thế) hoặc update() (merge partial); không tự broadcast.
 */

import type { ParsedDataset } from "@communicate/frame";

export type OtConfig = ParsedDataset & {
  // Additional fields (không có trong ParsedDataset)
  ipaddr?: string;
  leaderRloc16?: string; // from CMD_IP_ADDR ACK (byte 14-15)
  datasetActive?: string; // Hex string gốc (để giữ lại cho compatibility)
  threadVersion?: string;
  error?: string;
};

export class OtConfigStore {
  private config: OtConfig | null = null;

  get(): OtConfig | null {
    return this.config;
  }

  /** Thay thế toàn bộ config. */
  set(config: OtConfig): void {
    this.config = config;
  }

  /** Merge partial vào config hiện tại (hoặc dùng partial nếu chưa có). */
  update(partial: Partial<OtConfig>): void {
    this.config = { ...(this.config ?? {}), ...partial };
  }

  /** Xóa config (ví dụ khi disconnect). */
  clear(): void {
    this.config = null;
  }
}
