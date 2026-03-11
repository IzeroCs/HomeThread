/**
 * Device / topology / entity / state repository - type-safe (Drizzle).
 */

import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";

/** Heartbeat: online if last_seen within this window. */
export const HEARTBEAT_ONLINE_THRESHOLD_MS = 30_000;
/** Heartbeat: offline if last_seen older than this. */
export const HEARTBEAT_OFFLINE_THRESHOLD_MS = 5 * 60_000;

export type DeviceStatus = "online" | "away" | "offline";

/**
 * Pure: derive status from lastSeenAt and now. For use when exposing device list/detail.
 * Online: lastSeenAt within 30s. Away: (30s, 5m]. Offline: null or > 5m.
 */
export function getDeviceStatus(lastSeenAt: string | null, now: Date): DeviceStatus {
  if (lastSeenAt == null || lastSeenAt === "") return "offline";
  const t = new Date(lastSeenAt);
  if (Number.isNaN(t.getTime())) return "offline";
  const elapsed = now.getTime() - t.getTime();
  if (elapsed <= HEARTBEAT_ONLINE_THRESHOLD_MS) return "online";
  if (elapsed <= HEARTBEAT_OFFLINE_THRESHOLD_MS) return "away";
  return "offline";
}

/**
 * Update last_seen_at for device with given mac (16-char hex). No-op if not found.
 * Only called from GET /device/ping when mac query is valid.
 */
export function updateDeviceLastSeen(macHex: string): void {
  const db = getDrizzle();
  const row = db.select({ id: deviceInfo.id }).from(deviceInfo).where(eq(deviceInfo.macAddress, macHex)).get();
  if (!row) return;
  db.update(deviceInfo)
    .set({ lastSeenAt: sql`datetime('now')` })
    .where(eq(deviceInfo.macAddress, macHex))
    .run();
}
import { getDatabase, getDrizzle } from "../database.db";
import {
  deviceInfo,
  deviceTopology,
  deviceTopologyHistory,
  deviceTopologyNeighbor,
  deviceEntity,
  deviceEntityState,
  deviceEntityStateHistory,
} from "../database.schema";

export type EntityRestoreItem = {
  entity_id: string;
  restore_mode: number;
  state: number | null;
  brightness: number | null;
  mode: number | null;
  rgb_json: string | null;
  color_temp: number | null;
  value_real: number | null;
  has_saved_state: boolean;
};

/**
 * Pure function: slug từ device_name, trùng thì thêm _2, _3 (ESPHome style).
 * Không đụng DB — dễ unit test.
 */
export function generateSlug(deviceName: string, existingSlugs: string[]): string {
  const base = deviceName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");

  const baseOrFallback = base || "device";
  if (!existingSlugs.includes(baseOrFallback)) return baseOrFallback;

  let i = 2;
  while (existingSlugs.includes(`${baseOrFallback}_${i}`)) i++;
  return `${baseOrFallback}_${i}`;
}

export function resolveDeviceIdByMac(macHex: string): number | null {
  const db = getDrizzle();
  const row = db.select({ id: deviceInfo.id }).from(deviceInfo).where(eq(deviceInfo.macAddress, macHex)).get();
  return row?.id ?? null;
}

/** Resolve device_id of the Border Router (row with is_border_router = 1). Returns null if none. */
export function getBrDeviceId(): number | null {
  const db = getDrizzle();
  const row = db
    .select({ id: deviceInfo.id })
    .from(deviceInfo)
    .where(eq(deviceInfo.isBorderRouter, 1))
    .get();
  return row?.id ?? null;
}

export type UpsertDeviceInfoParams = {
  macHex: string;
  deviceName: string | null;
  deviceNameRaw: string | null;
  deviceType: number | null;
  isBorderRouter: number;
  manufacturer: string | null;
  model: string | null;
  swVersion: number | null;
  hwVersion: number | null;
};

export function upsertDeviceInfo(params: UpsertDeviceInfoParams): "created" | "changed" {
  const db = getDrizzle();
  const { macHex, deviceName, deviceNameRaw, deviceType, isBorderRouter, manufacturer, model, swVersion, hwVersion } = params;

  const existing = db.select({ id: deviceInfo.id }).from(deviceInfo).where(eq(deviceInfo.macAddress, macHex)).get();

  if (existing) {
    db.update(deviceInfo)
      .set({
        deviceNameRaw,
        deviceName: sql`COALESCE(${deviceInfo.deviceName}, ${deviceName})`,
        deviceType,
        isBorderRouter,
        manufacturer,
        model,
        swVersion,
        hwVersion,
        updatedAt: sql`(CURRENT_TIMESTAMP)`,
      })
      .where(eq(deviceInfo.macAddress, macHex))
      .run();
  } else {
    db.insert(deviceInfo)
      .values({
        macAddress: macHex,
        deviceName,
        deviceNameRaw,
        deviceType,
        isBorderRouter,
        manufacturer,
        model,
        swVersion,
        hwVersion,
      })
      .run();
  }

  const row = db
    .select({
      id: deviceInfo.id,
      deviceSlug: deviceInfo.deviceSlug,
      deviceName: deviceInfo.deviceName,
      deviceNameRaw: deviceInfo.deviceNameRaw,
    })
    .from(deviceInfo)
    .where(eq(deviceInfo.macAddress, macHex))
    .get();
  if (!row) throw new Error("device_info row not found");
  const deviceId = row.id;

  if (row.deviceSlug == null) {
    const existingSlugs = db
      .select({ slug: deviceInfo.deviceSlug })
      .from(deviceInfo)
      .where(isNotNull(deviceInfo.deviceSlug))
      .all()
      .map((r) => r.slug as string);

    const slugSource = row.deviceName ?? row.deviceNameRaw ?? macHex;
    const slug = generateSlug(slugSource, existingSlugs);

    db.update(deviceInfo)
      .set({ deviceSlug: slug, updatedAt: sql`(CURRENT_TIMESTAMP)` })
      .where(and(eq(deviceInfo.macAddress, macHex), isNull(deviceInfo.deviceSlug)))
      .run();
  }

  db.update(deviceEntity).set({ deletedAt: sql`(CURRENT_TIMESTAMP)` }).where(eq(deviceEntity.deviceId, deviceId)).run();
  const raw = getDatabase();
  raw.prepare(
    "UPDATE device_entity_state SET deleted_at = CURRENT_TIMESTAMP WHERE entity_id IN (SELECT id FROM device_entity WHERE device_id = ?)"
  ).run(deviceId);

  return existing ? "changed" : "created";
}

export type UpdateDeviceInfoParams = {
  macHex: string;
  deviceSlug: string | null;
  deviceName: string | null;
  deviceType: number | null;
  isBorderRouter: number;
  manufacturer: string | null;
  model: string | null;
  swVersion: number | null;
  hwVersion: number | null;
};

export function updateDeviceInfo(params: UpdateDeviceInfoParams): void {
  const db = getDrizzle();
  const { macHex, deviceSlug, deviceName, deviceType, isBorderRouter, manufacturer, model, swVersion, hwVersion } = params;
  db.update(deviceInfo)
    .set({
      ...(deviceSlug != null && { deviceSlug }),
      deviceName,
      deviceType,
      isBorderRouter,
      manufacturer,
      model,
      swVersion,
      hwVersion,
      updatedAt: sql`(CURRENT_TIMESTAMP)`,
    })
    .where(eq(deviceInfo.macAddress, macHex))
    .run();
}

export type TopologyNeighborItem = {
  neighborRloc16: string;
  rssi?: number | null;
  lqIn?: number | null;
  lqOut?: number | null;
  isChild: boolean;
};

export type UpsertTopologyParams = {
  deviceId: number;
  rloc16: string | null;
  parentRloc16: string | null;
  role: number | null;
  rssi: number | null;
  linkQuality: number | null;
  neighbors: TopologyNeighborItem[];
};

export function upsertTopology(params: UpsertTopologyParams): void {
  const db = getDrizzle();
  const { deviceId, rloc16, parentRloc16, role, rssi, linkQuality, neighbors } = params;

  const existing = db.select({ deviceId: deviceTopology.deviceId }).from(deviceTopology).where(eq(deviceTopology.deviceId, deviceId)).get();

  if (existing) {
    const row = db.select().from(deviceTopology).where(eq(deviceTopology.deviceId, deviceId)).get();
    if (row) {
      db.insert(deviceTopologyHistory).values({
        deviceId,
        rloc16: row.rloc16,
        parentRloc16: row.parentRloc16,
        role: row.role,
        rssi: row.rssi,
        linkQuality: row.linkQuality,
      }).run();
    }
  }

  if (existing) {
    db.update(deviceTopology)
      .set({ rloc16, parentRloc16, role, rssi, linkQuality, updatedAt: sql`(CURRENT_TIMESTAMP)` })
      .where(eq(deviceTopology.deviceId, deviceId))
      .run();
  } else {
    db.insert(deviceTopology).values({ deviceId, rloc16, parentRloc16, role, rssi, linkQuality }).run();
  }

  db.delete(deviceTopologyNeighbor).where(eq(deviceTopologyNeighbor.deviceId, deviceId)).run();
  for (const n of neighbors) {
    db.insert(deviceTopologyNeighbor).values({
      deviceId,
      neighborRloc16: n.neighborRloc16,
      rssi: n.rssi ?? null,
      lqIn: n.lqIn ?? null,
      lqOut: n.lqOut ?? null,
      isChild: n.isChild ? 1 : 0,
    }).run();
  }
}

export type MergeEntityItem = {
  entityId: string;
  name: string | null;
  nameRaw: string | null;
  type: number | null;
  deviceClass: number | null;
  unit: string | null;
  attributesJson: string | null;
  restoreMode: number;
  disabled: number;
};

export function mergeEntity(macHex: string, deviceId: number, entities: MergeEntityItem[]): { status: "created" | "changed"; restore: EntityRestoreItem[] } {
  const db = getDrizzle();
  let anyCreated = false;

  for (const e of entities) {
    const prev = db.select({ id: deviceEntity.id }).from(deviceEntity).where(and(eq(deviceEntity.deviceId, deviceId), eq(deviceEntity.entityId, e.entityId))).get();
    db.insert(deviceEntity)
      .values({
        deviceId,
        entityId: e.entityId,
        name: e.name,
        nameRaw: e.nameRaw,
        type: e.type,
        deviceClass: e.deviceClass,
        unit: e.unit,
        attributesJson: e.attributesJson,
        restoreMode: e.restoreMode,
        disabled: e.disabled,
        deletedAt: null,
      })
      .onConflictDoUpdate({
        target: [deviceEntity.deviceId, deviceEntity.entityId],
        set: {
          nameRaw: e.nameRaw,
          name: sql`COALESCE(${deviceEntity.name}, ${e.name})`,
          type: e.type,
          deviceClass: e.deviceClass,
          unit: e.unit,
          attributesJson: e.attributesJson,
          restoreMode: e.restoreMode,
          disabled: e.disabled,
          deletedAt: null,
          updatedAt: sql`(CURRENT_TIMESTAMP)`,
        },
      })
      .run();
    if (!prev) anyCreated = true;

    const entityRow = db.select({ id: deviceEntity.id }).from(deviceEntity).where(and(eq(deviceEntity.deviceId, deviceId), eq(deviceEntity.entityId, e.entityId))).get();
    if (entityRow) {
      db.update(deviceEntityState).set({ deletedAt: null, updatedAt: sql`(CURRENT_TIMESTAMP)` }).where(eq(deviceEntityState.entityId, entityRow.id)).run();
    }
  }

  const restoreRows = db
    .select({
      entity_id: deviceEntity.entityId,
      restore_mode: deviceEntity.restoreMode,
      state: deviceEntityState.state,
      brightness: deviceEntityState.brightness,
      mode: deviceEntityState.mode,
      rgb_json: deviceEntityState.rgbJson,
      color_temp: deviceEntityState.colorTemp,
      value_real: deviceEntityState.valueReal,
      deleted_at: deviceEntityState.deletedAt,
    })
    .from(deviceEntity)
    .leftJoin(deviceEntityState, eq(deviceEntityState.entityId, deviceEntity.id))
    .where(and(eq(deviceEntity.deviceId, deviceId), sql`${deviceEntity.deletedAt} IS NULL`))
    .all();

  const restore: EntityRestoreItem[] = restoreRows.map((r) => ({
    entity_id: r.entity_id,
    restore_mode: r.restore_mode ?? 0,
    state: r.state ?? null,
    brightness: r.brightness ?? null,
    mode: r.mode ?? null,
    rgb_json: r.rgb_json ?? null,
    color_temp: r.color_temp ?? null,
    value_real: r.value_real ?? null,
    has_saved_state: r.state != null && r.deleted_at == null,
  }));

  return { status: anyCreated ? "created" : "changed", restore };
}

export type UpdateEntityDefinitionItem = {
  entityId: string;
  name: string | null;
  type: number | null;
  deviceClass: number | null;
  unit: string | null;
  attributesJson: string | null;
  disabled: number;
};

export function updateEntityDefinition(deviceId: number, entities: UpdateEntityDefinitionItem[]): void {
  const db = getDrizzle();
  for (const e of entities) {
    db.update(deviceEntity)
      .set({
        name: e.name,
        type: e.type,
        deviceClass: e.deviceClass,
        unit: e.unit,
        attributesJson: e.attributesJson,
        disabled: e.disabled,
        updatedAt: sql`(CURRENT_TIMESTAMP)`,
      })
      .where(and(eq(deviceEntity.deviceId, deviceId), eq(deviceEntity.entityId, e.entityId)))
      .run();
  }
}

export type UpsertEntityStateItem = {
  entityIdStr: string;
  state: number | null;
  brightness: number | null;
  mode: number | null;
  rgbJson: string | null;
  colorTemp: number | null;
  valueReal: number | null;
};

export function upsertEntityState(deviceId: number, items: UpsertEntityStateItem[]): void {
  const db = getDrizzle();
  for (const item of items) {
    const entityRow = db.select({ id: deviceEntity.id }).from(deviceEntity).where(and(eq(deviceEntity.deviceId, deviceId), eq(deviceEntity.entityId, item.entityIdStr))).get();
    if (!entityRow) continue;

    const existingState = db.select({ entityId: deviceEntityState.entityId }).from(deviceEntityState).where(eq(deviceEntityState.entityId, entityRow.id)).get();

    if (existingState) {
      const row = db.select().from(deviceEntityState).where(eq(deviceEntityState.entityId, entityRow.id)).get();
      if (row) {
        db.insert(deviceEntityStateHistory).values({
          entityId: entityRow.id,
          state: row.state,
          brightness: row.brightness,
          mode: row.mode,
          rgbJson: row.rgbJson,
          colorTemp: row.colorTemp,
          valueReal: row.valueReal,
        }).run();
      }
    }

    if (existingState) {
      db.update(deviceEntityState)
        .set({
          state: item.state,
          brightness: item.brightness,
          mode: item.mode,
          rgbJson: item.rgbJson,
          colorTemp: item.colorTemp,
          valueReal: item.valueReal,
          deletedAt: null,
          updatedAt: sql`(CURRENT_TIMESTAMP)`,
        })
        .where(eq(deviceEntityState.entityId, entityRow.id))
        .run();
    } else {
      db.insert(deviceEntityState).values({
        entityId: entityRow.id,
        state: item.state,
        brightness: item.brightness,
        mode: item.mode,
        rgbJson: item.rgbJson,
        colorTemp: item.colorTemp,
        valueReal: item.valueReal,
      }).run();
    }
  }
}
