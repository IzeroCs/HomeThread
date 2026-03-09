/**
 * BrConnectionConfigService - Quản lý cấu hình kết nối BR (TCP) trong app_settings
 * Keys: br_host, br_port, use_mdns (không còn bảng br_connection_config)
 */

import { getDatabase } from "@database/database.db";
import type { BrConnectionConfig } from "shared/src/types";
import { BR_CONNECTION } from "shared/src/constants";

export type { BrConnectionConfig };

const KEY_BR_HOST = "br_host";
const KEY_BR_PORT = "br_port";
const KEY_USE_MDNS = "use_mdns";

function getValue(db: ReturnType<typeof getDatabase>, key: string): string | null {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function setValue(db: ReturnType<typeof getDatabase>, key: string, value: string): void {
  db.prepare(`
    INSERT INTO app_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

export class BrConnectionConfigService {
  private db = getDatabase();

  getLatest(): BrConnectionConfig | null {
    const brHost = getValue(this.db, KEY_BR_HOST);
    const brPort = getValue(this.db, KEY_BR_PORT);
    const useMdns = getValue(this.db, KEY_USE_MDNS);
    if (brHost == null || brPort == null || useMdns == null) return null;
    return {
      brHost,
      brPort: Number(brPort),
      useMdns: useMdns === "1",
    };
  }

  getById(_id: number): BrConnectionConfig | null {
    return this.getLatest();
  }

  create(config: Omit<BrConnectionConfig, "id" | "createdAt" | "updatedAt">): BrConnectionConfig {
    this.saveOrUpdate(config);
    const created = this.getLatest();
    if (!created) throw new Error("Failed to read created config");
    return created;
  }

  update(
    _id: number,
    config: Partial<Omit<BrConnectionConfig, "id" | "createdAt" | "updatedAt">>
  ): BrConnectionConfig | null {
    const current = this.getLatest();
    if (!current) return null;
    const next = {
      brHost: config.brHost ?? current.brHost,
      brPort: config.brPort ?? current.brPort,
      useMdns: config.useMdns ?? current.useMdns,
    };
    this.saveOrUpdate(next);
    return this.getLatest();
  }

  delete(_id: number): boolean {
    setValue(this.db, KEY_BR_HOST, "192.168.31.3");
    setValue(this.db, KEY_BR_PORT, String(BR_CONNECTION.DEFAULT_PORT));
    setValue(this.db, KEY_USE_MDNS, "0");
    return true;
  }

  getAll(): BrConnectionConfig[] {
    const one = this.getLatest();
    return one ? [one] : [];
  }

  hasConfig(): boolean {
    return this.getLatest() != null;
  }

  /**
   * Lưu hoặc cập nhật (một bộ config duy nhất trong app_settings)
   */
  saveOrUpdate(config: Omit<BrConnectionConfig, "id" | "createdAt" | "updatedAt">): BrConnectionConfig {
    const port = config.brPort ?? BR_CONNECTION.DEFAULT_PORT;
    const useMdns = config.useMdns ?? false;
    setValue(this.db, KEY_BR_HOST, config.brHost.trim());
    setValue(this.db, KEY_BR_PORT, String(port));
    setValue(this.db, KEY_USE_MDNS, useMdns ? "1" : "0");
    const result = this.getLatest();
    if (!result) throw new Error("Failed to read saved config");
    return result;
  }
}
