/**
 * BrConnectionConfigService - Quản lý cấu hình kết nối BR (TCP) trong SQLite
 * Thay SerialConfigService; host/port có thể từ mDNS (Thread-Host.local, _thread-frame._tcp)
 */

import { getDatabase } from "@database/database.db";
import type { BrConnectionConfig } from "shared/src/types";
import { BR_CONNECTION } from "shared/src/constants";

export type { BrConnectionConfig };

export class BrConnectionConfigService {
  private db = getDatabase();

  getLatest(): BrConnectionConfig | null {
    const stmt = this.db.prepare(`
      SELECT
        id,
        br_host as brHost,
        br_port as brPort,
        use_mdns as useMdns,
        created_at as createdAt,
        updated_at as updatedAt
      FROM br_connection_config
      ORDER BY created_at DESC
      LIMIT 1
    `);

    const row = stmt.get() as Record<string, unknown> | undefined;
    if (!row) return null;

    return {
      id: row.id as number,
      brHost: row.brHost as string,
      brPort: row.brPort as number,
      useMdns: Boolean(row.useMdns),
      createdAt: row.createdAt as string,
      updatedAt: row.updatedAt as string,
    };
  }

  getById(id: number): BrConnectionConfig | null {
    const stmt = this.db.prepare(`
      SELECT
        id,
        br_host as brHost,
        br_port as brPort,
        use_mdns as useMdns,
        created_at as createdAt,
        updated_at as updatedAt
      FROM br_connection_config
      WHERE id = ?
    `);

    const row = stmt.get(id) as Record<string, unknown> | undefined;
    if (!row) return null;

    return {
      id: row.id as number,
      brHost: row.brHost as string,
      brPort: row.brPort as number,
      useMdns: Boolean(row.useMdns),
      createdAt: row.createdAt as string,
      updatedAt: row.updatedAt as string,
    };
  }

  create(config: Omit<BrConnectionConfig, "id" | "createdAt" | "updatedAt">): BrConnectionConfig {
    const stmt = this.db.prepare(`
      INSERT INTO br_connection_config (br_host, br_port, use_mdns)
      VALUES (?, ?, ?)
    `);

    const useMdns = config.useMdns ?? false;
    const result = stmt.run(config.brHost.trim(), config.brPort, useMdns ? 1 : 0);

    const created = this.getById(result.lastInsertRowid as number);
    if (!created) throw new Error("Failed to retrieve created config");
    return created;
  }

  update(
    id: number,
    config: Partial<Omit<BrConnectionConfig, "id" | "createdAt" | "updatedAt">>
  ): BrConnectionConfig | null {
    const updates: string[] = [];
    const values: unknown[] = [];

    if (config.brHost !== undefined) {
      updates.push("br_host = ?");
      values.push(config.brHost.trim());
    }
    if (config.brPort !== undefined) {
      updates.push("br_port = ?");
      values.push(config.brPort);
    }
    if (config.useMdns !== undefined) {
      updates.push("use_mdns = ?");
      values.push(config.useMdns ? 1 : 0);
    }

    if (updates.length === 0) return this.getById(id);

    updates.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE br_connection_config
      SET ${updates.join(", ")}
      WHERE id = ?
    `);
    stmt.run(...values);
    return this.getById(id);
  }

  delete(id: number): boolean {
    const stmt = this.db.prepare("DELETE FROM br_connection_config WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }

  getAll(): BrConnectionConfig[] {
    const stmt = this.db.prepare(`
      SELECT
        id,
        br_host as brHost,
        br_port as brPort,
        use_mdns as useMdns,
        created_at as createdAt,
        updated_at as updatedAt
      FROM br_connection_config
      ORDER BY created_at DESC
    `);

    const rows = stmt.all() as Record<string, unknown>[];
    return rows.map((row) => ({
      id: row.id as number,
      brHost: row.brHost as string,
      brPort: row.brPort as number,
      useMdns: Boolean(row.useMdns),
      createdAt: row.createdAt as string,
      updatedAt: row.updatedAt as string,
    }));
  }

  hasConfig(): boolean {
    const stmt = this.db.prepare("SELECT COUNT(*) as count FROM br_connection_config");
    const result = stmt.get() as { count: number };
    return result.count > 0;
  }

  /**
   * Lưu hoặc cập nhật (chỉ giữ 1 record)
   */
  saveOrUpdate(config: Omit<BrConnectionConfig, "id" | "createdAt" | "updatedAt">): BrConnectionConfig {
    const existing = this.getLatest();
    const port = config.brPort ?? BR_CONNECTION.DEFAULT_PORT;
    if (existing?.id) {
      const updated = this.update(existing.id, {
        brHost: config.brHost,
        brPort: port,
        useMdns: config.useMdns,
      });
      if (!updated) throw new Error("Failed to update config");
      return updated;
    }
    return this.create({ ...config, brPort: port });
  }
}
