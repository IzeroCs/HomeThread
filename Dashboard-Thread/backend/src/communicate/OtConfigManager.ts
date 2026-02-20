/**
 * OtConfigManager - Quản lý và lưu dữ liệu OT config (panid, channel, networkName, ...).
 * Cập nhật qua set() (thay thế) hoặc update() (merge partial); không tự broadcast.
 */

export type OtConfig = {
  panid?: string;
  channel?: number;
  networkName?: string;
  ipaddr?: string;
  datasetActive?: string;
  error?: string;
};

export class OtConfigManager {
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
