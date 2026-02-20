/**
 * Database migrations - Tạo schema cho các bảng
 */

import { getDatabase } from "./Database";
import { logger } from "../utils/logger";

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
