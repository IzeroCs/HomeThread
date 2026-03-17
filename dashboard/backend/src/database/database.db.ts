/**
 * Database service - Quản lý kết nối SQLite (better-sqlite3 + Drizzle).
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { logger } from "@utils/logger.util";

const dbLog = logger.child("DB");

const DB_DIR = path.join(process.cwd(), "data", "database");
const DB_PATH = path.join(DB_DIR, "database.db");

let dbInstance: Database.Database | null = null;
let drizzleInstance: ReturnType<typeof drizzle> | null = null;

export function getDatabase(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  dbInstance = new Database(DB_PATH);
  dbInstance.pragma("foreign_keys = ON");
  dbInstance.pragma("journal_mode = WAL");

  dbLog.info(`Initialized: ${path.relative("./", DB_PATH)}`);

  return dbInstance;
}

/** Drizzle instance (dùng cho migrate() và query). */
export function getDrizzle(): ReturnType<typeof drizzle> {
  if (!drizzleInstance) {
    drizzleInstance = drizzle({ client: getDatabase() });
  }
  return drizzleInstance;
}

export function closeDatabase(): void {
  drizzleInstance = null;
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    dbLog.info("Closed");
  }
}
