/**
 * Database service - Quản lý kết nối SQLite
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "database.db");

let dbInstance: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  // Tạo thư mục data nếu chưa có
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  // Khởi tạo database
  dbInstance = new Database(DB_PATH);

  // Enable foreign keys và WAL mode
  dbInstance.pragma("foreign_keys = ON");
  dbInstance.pragma("journal_mode = WAL");

  console.log(`Database initialized: ${DB_PATH}`);

  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    console.log("Database closed");
  }
}
