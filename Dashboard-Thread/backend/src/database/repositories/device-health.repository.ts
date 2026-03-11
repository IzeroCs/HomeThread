/**
 * BR health snapshot repository — one row per device, upsert on each poll/notify.
 */

import { sql } from "drizzle-orm";
import { getDrizzle } from "../database.db";
import { deviceHealthBr } from "../database.schema";

export function upsertBrHealth(
  deviceId: number,
  freeHeap: number | null,
  minimumFreeHeap: number | null,
  uptime: number | null,
  mleDetachCount: number | null,
  stackHwm: string | null = null
): void {
  const db = getDrizzle();
  db.insert(deviceHealthBr)
    .values({
      deviceId,
      freeHeap: freeHeap ?? null,
      minimumFreeHeap: minimumFreeHeap ?? null,
      uptime: uptime ?? null,
      mleDetachCount: mleDetachCount ?? null,
      stackHwm: stackHwm ?? null,
    })
    .onConflictDoUpdate({
      target: deviceHealthBr.deviceId,
      set: {
        freeHeap: freeHeap ?? null,
        minimumFreeHeap: minimumFreeHeap ?? null,
        uptime: uptime ?? null,
        mleDetachCount: mleDetachCount ?? null,
        stackHwm: stackHwm ?? null,
        recordedAt: sql`CURRENT_TIMESTAMP`,
      },
    })
    .run();
}
