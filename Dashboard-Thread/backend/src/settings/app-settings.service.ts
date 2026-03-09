/**
 * AppSettings Service - Cài đặt app lưu SQLite (vd: có tự chạy Thread khi serial connect không)
 */

import { getDatabase } from "@database/database.db";

const KEY_THREAD_RUN_ON_CONNECT = "thread_run_on_connect";

export class AppSettingsService {
  private db = getDatabase();

  getThreadRunOnConnect(): boolean {
    const stmt = this.db.prepare(
      "SELECT value FROM app_settings WHERE key = ?"
    );
    const row = stmt.get(KEY_THREAD_RUN_ON_CONNECT) as { value: string } | undefined;
    if (!row) return false;
    return row.value === "1";
  }

  setThreadRunOnConnect(run: boolean): void {
    const stmt = this.db.prepare(`
      INSERT INTO app_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    stmt.run(KEY_THREAD_RUN_ON_CONNECT, run ? "1" : "0");
  }
}
