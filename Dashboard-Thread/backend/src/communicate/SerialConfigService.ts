/**
 * SerialConfig Service - Quản lý cấu hình serial port trong SQLite
 */

import { getDatabase } from "../database/Database";

export interface SerialConfig {
  id?: number;
  serialPort: string;
  baudRate: number;
  commandPrefix: string;
  createdAt?: string;
  updatedAt?: string;
}

export class SerialConfigService {
  private db = getDatabase();

  /**
   * Lấy cấu hình mới nhất
   */
  getLatest(): SerialConfig | null {
    const stmt = this.db.prepare(`
      SELECT 
        id,
        serial_port as serialPort,
        baud_rate as baudRate,
        command_prefix as commandPrefix,
        created_at as createdAt,
        updated_at as updatedAt
      FROM serial_config
      ORDER BY created_at DESC
      LIMIT 1
    `);

    const row = stmt.get() as any;
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      serialPort: row.serialPort,
      baudRate: row.baudRate,
      commandPrefix: row.commandPrefix,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Lấy cấu hình theo ID
   */
  getById(id: number): SerialConfig | null {
    const stmt = this.db.prepare(`
      SELECT 
        id,
        serial_port as serialPort,
        baud_rate as baudRate,
        command_prefix as commandPrefix,
        created_at as createdAt,
        updated_at as updatedAt
      FROM serial_config
      WHERE id = ?
    `);

    const row = stmt.get(id) as any;
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      serialPort: row.serialPort,
      baudRate: row.baudRate,
      commandPrefix: row.commandPrefix,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Tạo cấu hình mới
   */
  create(config: Omit<SerialConfig, "id" | "createdAt" | "updatedAt">): SerialConfig {
    const stmt = this.db.prepare(`
      INSERT INTO serial_config (serial_port, baud_rate, command_prefix)
      VALUES (?, ?, ?)
    `);

    const result = stmt.run(
      config.serialPort,
      config.baudRate,
      config.commandPrefix
    );

    const created = this.getById(result.lastInsertRowid as number);
    if (!created) {
      throw new Error("Failed to retrieve created config");
    }

    return created;
  }

  /**
   * Cập nhật cấu hình
   */
  update(id: number, config: Partial<Omit<SerialConfig, "id" | "createdAt" | "updatedAt">>): SerialConfig | null {
    const updates: string[] = [];
    const values: any[] = [];

    if (config.serialPort !== undefined) {
      updates.push("serial_port = ?");
      values.push(config.serialPort);
    }
    if (config.baudRate !== undefined) {
      updates.push("baud_rate = ?");
      values.push(config.baudRate);
    }
    if (config.commandPrefix !== undefined) {
      updates.push("command_prefix = ?");
      values.push(config.commandPrefix);
    }

    if (updates.length === 0) {
      return this.getById(id);
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE serial_config
      SET ${updates.join(", ")}
      WHERE id = ?
    `);

    stmt.run(...values);

    return this.getById(id);
  }

  /**
   * Xóa cấu hình
   */
  delete(id: number): boolean {
    const stmt = this.db.prepare("DELETE FROM serial_config WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Lấy tất cả cấu hình
   */
  getAll(): SerialConfig[] {
    const stmt = this.db.prepare(`
      SELECT 
        id,
        serial_port as serialPort,
        baud_rate as baudRate,
        command_prefix as commandPrefix,
        created_at as createdAt,
        updated_at as updatedAt
      FROM serial_config
      ORDER BY created_at DESC
    `);

    const rows = stmt.all() as any[];
    return rows.map((row) => ({
      id: row.id,
      serialPort: row.serialPort,
      baudRate: row.baudRate,
      commandPrefix: row.commandPrefix,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  /**
   * Kiểm tra có cấu hình nào không
   */
  hasConfig(): boolean {
    const stmt = this.db.prepare("SELECT COUNT(*) as count FROM serial_config");
    const result = stmt.get() as { count: number };
    return result.count > 0;
  }

  /**
   * Lưu hoặc cập nhật cấu hình (chỉ giữ 1 record)
   * Nếu đã có config thì update, không thì create mới
   */
  saveOrUpdate(config: Omit<SerialConfig, "id" | "createdAt" | "updatedAt">): SerialConfig {
    const existing = this.getLatest();
    if (existing?.id) {
      const updated = this.update(existing.id, {
        serialPort: config.serialPort,
        baudRate: config.baudRate,
        commandPrefix: config.commandPrefix,
      });
      if (!updated) {
        throw new Error("Failed to update config");
      }
      return updated;
    }
    return this.create(config);
  }
}
