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
