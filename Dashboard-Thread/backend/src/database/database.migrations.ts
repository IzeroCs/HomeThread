/**
 * Database migrations - Schema ban đầu (chỉ tạo bảng + seed, không alter/drop).
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
    name: "001_initial_schema",
    up: (db) => {
      // app_settings: key/value + BR config (br_host, br_port, use_mdns)
      db.exec(`
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);
      db.exec(`
        INSERT OR IGNORE INTO app_settings (key, value) VALUES
          ('thread_run_on_connect', '0'),
          ('br_host', '192.168.31.3'),
          ('br_port', '5000'),
          ('use_mdns', '0')
      `);

      // device_info: CoAP register/info (mac_address = key)
      db.exec(`
        CREATE TABLE IF NOT EXISTS device_info (
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

      // device_topology, device_topology_history
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
        CREATE INDEX IF NOT EXISTS idx_device_topology_device ON device_topology(device_id)
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

      // device_entity: CoAP register/entity (device_id = device_info.id)
      db.exec(`
        CREATE TABLE IF NOT EXISTS device_entity (
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
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_device_entity_device ON device_entity(device_id)
      `);

      // device_entity_state, device_entity_state_history (entity_id = device_entity.id)
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
        CREATE INDEX IF NOT EXISTS idx_device_entity_state_entity ON device_entity_state(entity_id)
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
  } catch {
    return false;
  }
}

/**
 * Đánh dấu migration đã chạy
 */
function markMigrationRun(db: ReturnType<typeof getDatabase>, name: string): void {
  db.prepare("INSERT INTO migrations (name, executed_at) VALUES (?, CURRENT_TIMESTAMP)").run(name);
}

/**
 * Chạy tất cả migrations chưa được thực thi
 */
export function runMigrations(): void {
  const db = getDatabase();

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
