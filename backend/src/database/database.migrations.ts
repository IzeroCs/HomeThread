/**
 * Database migrations - Dùng migrate() của Drizzle (drizzle-kit generate).
 */

import path from "path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDataRoot, getDrizzle } from "./database.db";
import { appSettings } from "./database.schema";
import { logger } from "@utils/logger.util";

const migrationLog = logger.child("Migration");

function getMigrationsFolder(): string {
  return path.join(getDataRoot(), "migrations");
}

const APP_SETTINGS_SEED: Array<{ key: string; value: string }> = [
  { key: "thread_run_on_connect", value: "1" },
  { key: "br_host", value: "192.168.31.3" },
  { key: "br_port", value: "5000" },
  { key: "use_mdns", value: "0" },
];

/**
 * Chạy migrations (Drizzle migrate) + seed app_settings nếu chưa có.
 */
export function runMigrations(): void {
  const db = getDrizzle();
  const migrationsFolder = getMigrationsFolder();

  migrationLog.info("Running migrations...");
  migrate(db, { migrationsFolder });
  migrationLog.info("Migrations done");

  try {
    const existing = db.select().from(appSettings).where(eq(appSettings.key, "thread_run_on_connect")).get();
    if (!existing) {
      db.insert(appSettings).values(APP_SETTINGS_SEED).onConflictDoNothing().run();
      migrationLog.info("Seeded app_settings defaults");
    }
  } catch {
    // Bảng app_settings chưa tồn tại
  }
}
