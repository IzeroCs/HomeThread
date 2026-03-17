/**
 * App settings repository - type-safe (Drizzle). Gồm cả BR config (br_host, br_port, use_mdns).
 */

import { eq } from "drizzle-orm";
import { getDrizzle } from "../database.db";
import { appSettings } from "../database.schema";

export function getAppSetting(key: string): string | null {
  const db = getDrizzle();
  const row = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
  return row?.value ?? null;
}

export function setAppSetting(key: string, value: string): void {
  const db = getDrizzle();
  db.insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } })
    .run();
}
