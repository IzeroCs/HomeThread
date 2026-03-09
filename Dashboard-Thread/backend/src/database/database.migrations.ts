/**
 * Database migrations - Tạo schema cho các bảng
 */

import { getDatabase } from "./database.db";
import { logger } from "@utils/logger.util";

const migrationLog = logger.child("Migration");

interface Migration {
  name: string;
  up: (db: ReturnType<typeof getDatabase>) => void;
}

const migrations: Migration[] = [
  {
    name: "001_create_serial_config",
    up: (db) => {
      // Bảng serial_config - Lưu cấu hình serial port
      db.exec(`
        CREATE TABLE IF NOT EXISTS serial_config (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          serial_port TEXT NOT NULL,
          baud_rate INTEGER NOT NULL,
          command_prefix TEXT NOT NULL DEFAULT 'ot',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Tạo index
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_serial_config_created_at
        ON serial_config(created_at)
      `);
    },
  },
  {
    name: "002_serial_config_single_row",
    up: (db) => {
      // Chỉ giữ 1 record (id lớn nhất), xóa các record cũ
      db.exec(`
        DELETE FROM serial_config
        WHERE id NOT IN (SELECT MAX(id) FROM serial_config)
      `);
    },
  },
  {
    name: "003_app_settings",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);
      // Mặc định: không tự chạy Thread khi kết nối
      db.exec(`
        INSERT OR IGNORE INTO app_settings (key, value) VALUES ('thread_run_on_connect', '0')
      `);
    },
  },
  {
    name: "004_drop_command_prefix",
    up: (db) => {
      // Giao tiếp frame, không dùng command prefix nữa — bỏ cột command_prefix
      db.exec(`
        CREATE TABLE serial_config_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          serial_port TEXT NOT NULL,
          baud_rate INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      db.exec(`
        INSERT INTO serial_config_new (id, serial_port, baud_rate, created_at, updated_at)
        SELECT id, serial_port, baud_rate, created_at, updated_at FROM serial_config
      `);
      db.exec(`DROP TABLE serial_config`);
      db.exec(`ALTER TABLE serial_config_new RENAME TO serial_config`);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_serial_config_created_at ON serial_config(created_at)
      `);
    },
  },
  {
    name: "005_create_br_connection_config",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS br_connection_config (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          br_host TEXT NOT NULL,
          br_port INTEGER NOT NULL,
          use_mdns INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_br_connection_config_created_at
        ON br_connection_config(created_at)
      `);
      // Mặc định 1 record nếu bảng rỗng: 192.168.31.3:5000 (tạm dùng IP, tránh mDNS trong Docker)
      db.exec(`
        INSERT INTO br_connection_config (br_host, br_port, use_mdns)
        SELECT '192.168.31.3', 5000, 0
        WHERE (SELECT COUNT(*) FROM br_connection_config) = 0
      `);
    },
  },
  {
    name: "006_drop_serial_config",
    up: (db) => {
      // BR chỉ dùng TCP (br_connection_config); bảng serial_config legacy không còn dùng
      db.exec(`DROP TABLE IF EXISTS serial_config`);
    },
  },
  {
    name: "007_coap_device_entity",
    up: (db) => {
      // Device từ POST /device/register (keys 0–8). Identify by device_id or source_address.
      db.exec(`
        CREATE TABLE IF NOT EXISTS device_info (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          device_id TEXT NOT NULL,
          device_name TEXT,
          device_type INTEGER,
          manufacturer TEXT,
          model TEXT,
          sw_version INTEGER,
          hw_version INTEGER,
          mac_address INTEGER,
          rloc16 TEXT,
          role INTEGER,
          ipv6_blob BLOB,
          parent_rloc16 INTEGER,
          source_address TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(device_id)
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_device_info_source ON device_info(source_address)`);
      // Entity từ POST /device/entities (key 9). Merge by (device_id, entity_id).
      db.exec(`
        CREATE TABLE IF NOT EXISTS device_entity (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          device_id TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          name TEXT,
          type INTEGER,
          device_class INTEGER,
          available INTEGER,
          last_update INTEGER,
          state INTEGER,
          brightness INTEGER,
          mode INTEGER,
          rgb_json TEXT,
          color_temp INTEGER,
          value_real REAL,
          unit TEXT,
          attributes_json TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(device_id, entity_id)
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_device_entity_device ON device_entity(device_id)`);
    },
  },
  {
    name: "008_rename_coap_tables_to_device_info_entity",
    up: (db) => {
      // Rename old table names (nếu đã chạy 007 với tên cũ)
      const sqliteMaster = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get("coap_device") as { name: string } | undefined;
      if (sqliteMaster) {
        db.exec(`ALTER TABLE coap_device RENAME TO device_info`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_device_info_source ON device_info(source_address)`);
      }
      const entityTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get("coap_entity") as { name: string } | undefined;
      if (entityTable) {
        db.exec(`ALTER TABLE coap_entity RENAME TO device_entity`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_device_entity_device ON device_entity(device_id)`);
      }
    },
  },
  {
    name: "009_device_info_topology_entity_state",
    up: (db) => {
      const hasOldDeviceInfo = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='device_info'").get() as { name: string } | undefined) != null;
      const hasOldDeviceEntity = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='device_entity'").get() as { name: string } | undefined) != null;

      // 1. device_info: new schema (mac_address TEXT UNIQUE, device_slug, no topology columns)
      db.exec(`
        CREATE TABLE IF NOT EXISTS device_info_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          mac_address TEXT NOT NULL UNIQUE,
          device_slug TEXT UNIQUE,
          device_name TEXT,
          device_type INTEGER,
          manufacturer TEXT,
          model TEXT,
          sw_version INTEGER,
          hw_version INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      if (hasOldDeviceInfo) {
        const rows = db.prepare("SELECT id, device_id, device_name, device_type, manufacturer, model, sw_version, hw_version, mac_address, created_at, updated_at FROM device_info").all() as Array<{
          id: number;
          device_id: string;
          device_name: string | null;
          device_type: number | null;
          manufacturer: string | null;
          model: string | null;
          sw_version: number | null;
          hw_version: number | null;
          mac_address: number | null;
          created_at: string | null;
          updated_at: string | null;
        }>;
        const ins = db.prepare(`
          INSERT INTO device_info_new (mac_address, device_slug, device_name, device_type, manufacturer, model, sw_version, hw_version, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const r of rows) {
          const macText = r.mac_address != null ? (r.mac_address >>> 0).toString(16).padStart(16, "0") : `mig_${r.id}`;
          const slug = r.device_id ?? null;
          ins.run(macText, slug, r.device_name, r.device_type, r.manufacturer, r.model, r.sw_version, r.hw_version, r.created_at ?? undefined, r.updated_at ?? undefined);
        }
      }

      // 2. device_topology (one row per device), device_topology_history
      db.exec(`
        CREATE TABLE IF NOT EXISTS device_topology (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          device_id INTEGER NOT NULL,
          rloc16 TEXT,
          parent_rloc16 TEXT,
          role INTEGER,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(device_id)
        )
      `);
      db.exec(`
        CREATE TABLE IF NOT EXISTS device_topology_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          device_id INTEGER NOT NULL,
          rloc16 TEXT,
          parent_rloc16 TEXT,
          role INTEGER,
          recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_device_topology_device ON device_topology(device_id)`);

      if (hasOldDeviceInfo) {
        const oldWithNetwork = db.prepare(`
          SELECT oi.id AS old_id, oi.rloc16, oi.role, oi.parent_rloc16,
                 ni.id AS new_id
          FROM device_info oi
          JOIN device_info_new ni ON ni.device_slug = oi.device_id
        `).all() as Array<{ old_id: number; rloc16: string | null; role: number | null; parent_rloc16: number | null; new_id: number }>;
        const topIns = db.prepare(`
          INSERT INTO device_topology (device_id, rloc16, parent_rloc16, role)
          VALUES (?, ?, ?, ?)
        `);
        for (const r of oldWithNetwork) {
          const parentStr = r.parent_rloc16 != null ? String(r.parent_rloc16) : null;
          topIns.run(r.new_id, r.rloc16, parentStr, r.role);
        }
      }

      db.exec(`DROP TABLE IF EXISTS device_info`);
      db.exec(`ALTER TABLE device_info_new RENAME TO device_info`);

      // 3. device_entity: device_id INTEGER FK to device_info(id), restore_mode, deleted_at
      db.exec(`
        CREATE TABLE IF NOT EXISTS device_entity_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          device_id INTEGER NOT NULL,
          entity_id TEXT NOT NULL,
          name TEXT,
          type INTEGER,
          device_class INTEGER,
          unit TEXT,
          attributes_json TEXT,
          restore_mode INTEGER DEFAULT 0,
          deleted_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(device_id, entity_id)
        )
      `);

      if (hasOldDeviceEntity) {
        db.exec(`
          INSERT INTO device_entity_new (device_id, entity_id, name, type, device_class, unit, attributes_json, restore_mode, deleted_at, created_at, updated_at)
          SELECT di.id, oe.entity_id, oe.name, oe.type, oe.device_class, oe.unit, oe.attributes_json, 0, NULL, oe.created_at, oe.updated_at
          FROM device_entity oe
          JOIN device_info di ON di.device_slug = oe.device_id
        `);
      }

      // 4. device_entity_state (one row per entity; entity_id references device_entity.id after rename), device_entity_state_history
      db.exec(`
        CREATE TABLE IF NOT EXISTS device_entity_state (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_id INTEGER NOT NULL,
          available INTEGER,
          state INTEGER,
          brightness INTEGER,
          mode INTEGER,
          rgb_json TEXT,
          color_temp INTEGER,
          value_real REAL,
          deleted_at DATETIME,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(entity_id)
        )
      `);
      db.exec(`
        CREATE TABLE IF NOT EXISTS device_entity_state_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_id INTEGER NOT NULL,
          available INTEGER,
          state INTEGER,
          brightness INTEGER,
          mode INTEGER,
          rgb_json TEXT,
          color_temp INTEGER,
          value_real REAL,
          recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_device_entity_state_entity ON device_entity_state(entity_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_device_entity_device ON device_entity(device_id)`);

      if (hasOldDeviceEntity) {
        db.exec(`
          INSERT INTO device_entity_state (entity_id, available, state, brightness, mode, rgb_json, color_temp, value_real, deleted_at, updated_at)
          SELECT ne.id, oe.available, oe.state, oe.brightness, oe.mode, oe.rgb_json, oe.color_temp, oe.value_real, NULL, oe.updated_at
          FROM device_entity oe
          JOIN device_info di ON di.device_slug = oe.device_id
          JOIN device_entity_new ne ON ne.device_id = di.id AND ne.entity_id = oe.entity_id
        `);
      }

      db.exec(`DROP TABLE IF EXISTS device_entity`);
      db.exec(`ALTER TABLE device_entity_new RENAME TO device_entity`);
    },
  },
];

/**
 * Kiểm tra xem migration đã chạy chưa
 */
function hasMigrationRun(db: ReturnType<typeof getDatabase>, name: string): boolean {
  try {
    const stmt = db.prepare("SELECT COUNT(*) as count FROM migrations WHERE name = ?");
    const result = stmt.get(name) as { count: number };
    return result.count > 0;
  } catch (error) {
    // Bảng migrations chưa tồn tại
    return false;
  }
}

/**
 * Đánh dấu migration đã chạy
 */
function markMigrationRun(db: ReturnType<typeof getDatabase>, name: string): void {
  const stmt = db.prepare("INSERT INTO migrations (name, executed_at) VALUES (?, CURRENT_TIMESTAMP)");
  stmt.run(name);
}

/**
 * Chạy tất cả migrations chưa được thực thi
 */
export function runMigrations(): void {
  const db = getDatabase();

  // Tạo bảng migrations để track các migrations đã chạy
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  let executedCount = 0;

  for (const migration of migrations) {
    if (!hasMigrationRun(db, migration.name)) {
      migrationLog.info(`Running: ${migration.name}`);
      migration.up(db);
      markMigrationRun(db, migration.name);
      executedCount++;
    }
  }

  if (executedCount > 0) {
    migrationLog.info(`Executed ${executedCount} migration(s)`);
  } else {
    migrationLog.info("All migrations are up to date");
  }
}
