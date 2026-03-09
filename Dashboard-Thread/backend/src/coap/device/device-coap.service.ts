/**
 * CoAP device & entity store — device_info, device_topology, device_entity, device_entity_state.
 * Identifies devices by mac_address (TEXT hex). Slug is backend-generated only.
 */

import { getDatabase } from "@database/database.db";
import {
  DEVICE_REGISTER_KEYS,
  NETWORK_KEYS,
  ENTITY_KEYS,
  getPayloadField,
} from "./device.payload";

export type DeviceRecord = {
  id: number;
  mac_address: string;
  device_slug: string | null;
  device_name: string | null;
  device_type: number | null;
  manufacturer: string | null;
  model: string | null;
  sw_version: number | null;
  hw_version: number | null;
  updated_at: string;
};

export type EntityRecord = {
  id: number;
  device_id: number;
  entity_id: string;
  name: string | null;
  type: number | null;
  device_class: number | null;
  unit: string | null;
  restore_mode: number;
  updated_at: string;
};

/** Restore hint for one entity: what to send down to node (state or default from restore_mode). */
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

/** Normalize to string for DB */
function str(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  return String(v);
}

/** Normalize to number for DB */
function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/** Convert payload mac_address (number, EUI-64) to 16-char hex string. Throws if missing/invalid. */
export function macAddressToHex(v: unknown): string {
  const n = num(v);
  if (n == null) throw new Error("mac_address (key 7) is required");
  return (n >>> 0).toString(16).padStart(16, "0").toLowerCase();
}

/** Generate device_slug from mac (backend-only). */
function generateSlug(macHex: string): string {
  return `d-${macHex.slice(-8)}`;
}

/** Resolve device_info.id by mac_address. */
function resolveDeviceIdByMac(db: ReturnType<typeof getDatabase>, macHex: string): number | null {
  const row = db.prepare("SELECT id FROM device_info WHERE mac_address = ?").get(macHex) as { id: number } | undefined;
  return row?.id ?? null;
}

/**
 * Upsert device_info from POST /device/register/info.
 * Then generate slug if null, soft-delete all entities and states for this device.
 */
export function upsertDeviceInfo(parsed: Record<string, unknown>): "created" | "changed" {
  const db = getDatabase();
  const macHex = macAddressToHex(getPayloadField(parsed, DEVICE_REGISTER_KEYS.MAC_ADDRESS));

  const deviceName = str(getPayloadField(parsed, DEVICE_REGISTER_KEYS.DEVICE_NAME));
  const deviceType = num(getPayloadField(parsed, DEVICE_REGISTER_KEYS.DEVICE_TYPE));
  const manufacturer = str(getPayloadField(parsed, DEVICE_REGISTER_KEYS.MANUFACTURER));
  const model = str(getPayloadField(parsed, DEVICE_REGISTER_KEYS.MODEL));
  const swVersion = num(getPayloadField(parsed, DEVICE_REGISTER_KEYS.SW_VERSION));
  const hwVersion = num(getPayloadField(parsed, DEVICE_REGISTER_KEYS.HW_VERSION));

  const existing = db.prepare("SELECT id FROM device_info WHERE mac_address = ?").get(macHex) as { id: number } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE device_info SET
        device_name = ?, device_type = ?, manufacturer = ?, model = ?,
        sw_version = ?, hw_version = ?, updated_at = CURRENT_TIMESTAMP
       WHERE mac_address = ?`
    ).run(deviceName, deviceType, manufacturer, model, swVersion, hwVersion, macHex);
  } else {
    db.prepare(
      `INSERT INTO device_info (mac_address, device_name, device_type, manufacturer, model, sw_version, hw_version)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(macHex, deviceName, deviceType, manufacturer, model, swVersion, hwVersion);
  }

  const deviceId = (db.prepare("SELECT id FROM device_info WHERE mac_address = ?").get(macHex) as { id: number }).id;

  const slugRow = db.prepare("SELECT device_slug FROM device_info WHERE mac_address = ?").get(macHex) as { device_slug: string | null };
  if (slugRow.device_slug == null) {
    const slug = generateSlug(macHex);
    db.prepare("UPDATE device_info SET device_slug = ?, updated_at = CURRENT_TIMESTAMP WHERE mac_address = ? AND device_slug IS NULL").run(slug, macHex);
  }

  db.prepare("UPDATE device_entity SET deleted_at = CURRENT_TIMESTAMP WHERE device_id = ?").run(deviceId);
  db.prepare(
    `UPDATE device_entity_state SET deleted_at = CURRENT_TIMESTAMP
     WHERE entity_id IN (SELECT id FROM device_entity WHERE device_id = ?)`
  ).run(deviceId);

  return existing ? "changed" : "created";
}

/**
 * Update device_info from POST /device/update/info (device_slug, device_name, etc. — backend/UI may set slug).
 */
export function updateDeviceInfo(parsed: Record<string, unknown>): void {
  const db = getDatabase();
  const macHex = macAddressToHex(getPayloadField(parsed, DEVICE_REGISTER_KEYS.MAC_ADDRESS));
  const deviceSlug = str(getPayloadField(parsed, DEVICE_REGISTER_KEYS.DEVICE_ID));
  const deviceName = str(getPayloadField(parsed, DEVICE_REGISTER_KEYS.DEVICE_NAME));
  const deviceType = num(getPayloadField(parsed, DEVICE_REGISTER_KEYS.DEVICE_TYPE));
  const manufacturer = str(getPayloadField(parsed, DEVICE_REGISTER_KEYS.MANUFACTURER));
  const model = str(getPayloadField(parsed, DEVICE_REGISTER_KEYS.MODEL));
  const swVersion = num(getPayloadField(parsed, DEVICE_REGISTER_KEYS.SW_VERSION));
  const hwVersion = num(getPayloadField(parsed, DEVICE_REGISTER_KEYS.HW_VERSION));

  db.prepare(
    `UPDATE device_info SET
      device_slug = COALESCE(?, device_slug),
      device_name = ?, device_type = ?, manufacturer = ?, model = ?,
      sw_version = ?, hw_version = ?, updated_at = CURRENT_TIMESTAMP
     WHERE mac_address = ?`
  ).run(deviceSlug, deviceName, deviceType, manufacturer, model, swVersion, hwVersion, macHex);
}

/**
 * Upsert device_topology and append history from POST /device/update/topology.
 */
export function upsertTopology(parsed: Record<string, unknown>): void {
  const db = getDatabase();
  const macHex = macAddressToHex(getPayloadField(parsed, DEVICE_REGISTER_KEYS.MAC_ADDRESS));
  const deviceId = resolveDeviceIdByMac(db, macHex);
  if (deviceId == null) throw new Error("device not found for mac_address");

  let rloc16: string | null = null;
  let role: number | null = null;
  let parentRloc16: string | null = null;
  const network = getPayloadField<Record<string, unknown>>(parsed, DEVICE_REGISTER_KEYS.NETWORK);
  if (network && typeof network === "object") {
    const rloc = network[String(NETWORK_KEYS.RLOC16)] ?? network[NETWORK_KEYS.RLOC16];
    rloc16 = rloc != null ? String(rloc) : null;
    role = num(network[String(NETWORK_KEYS.ROLE)] ?? network[NETWORK_KEYS.ROLE]);
    const parent = network[String(NETWORK_KEYS.PARENT)] ?? network[NETWORK_KEYS.PARENT];
    parentRloc16 = parent != null ? String(parent) : null;
  }

  const existingTopo = db.prepare("SELECT device_id FROM device_topology WHERE device_id = ?").get(deviceId) as { device_id: number } | undefined;
  if (existingTopo) {
    db.prepare(
      `INSERT INTO device_topology_history (device_id, rloc16, parent_rloc16, role)
       SELECT device_id, rloc16, parent_rloc16, role FROM device_topology WHERE device_id = ?`
    ).run(deviceId);
  }

  if (existingTopo) {
    db.prepare(
      `UPDATE device_topology SET rloc16 = ?, parent_rloc16 = ?, role = ?, updated_at = CURRENT_TIMESTAMP WHERE device_id = ?`
    ).run(rloc16, parentRloc16, role, deviceId);
  } else {
    db.prepare(
      `INSERT INTO device_topology (device_id, rloc16, parent_rloc16, role) VALUES (?, ?, ?, ?)`
    ).run(deviceId, rloc16, parentRloc16, role);
  }
}

function getEntityField<T>(entity: Record<string, unknown>, key: number): T | undefined {
  return (entity[String(key)] ?? entity[key as unknown as string]) as T | undefined;
}

/**
 * Merge entities from POST /device/register/entity; restore state (deleted_at = NULL); return list for restore-down.
 */
export function mergeEntity(
  parsed: Record<string, unknown>
): { status: "created" | "changed"; restore: EntityRestoreItem[] } {
  const db = getDatabase();
  const macHex = macAddressToHex(getPayloadField(parsed, DEVICE_REGISTER_KEYS.MAC_ADDRESS));
  const deviceId = resolveDeviceIdByMac(db, macHex);
  if (deviceId == null) throw new Error("device not found for mac_address");

  const arr = getPayloadField<unknown[]>(parsed, DEVICE_REGISTER_KEYS.ENTITIES);
  const entitiesList = Array.isArray(arr) ? arr.filter((e): e is Record<string, unknown> => e != null && typeof e === "object" && !Array.isArray(e)) : [];

  let anyCreated = false;
  const keySet = new Set<number>(Object.values(ENTITY_KEYS) as number[]);
  const upsertEntity = db.prepare(`
    INSERT INTO device_entity (device_id, entity_id, name, type, device_class, unit, attributes_json, restore_mode, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(device_id, entity_id) DO UPDATE SET
      name = excluded.name, type = excluded.type, device_class = excluded.device_class,
      unit = excluded.unit, attributes_json = excluded.attributes_json, restore_mode = excluded.restore_mode, deleted_at = NULL, updated_at = CURRENT_TIMESTAMP
  `);
  const restoreState = db.prepare(`
    UPDATE device_entity_state SET deleted_at = NULL
    WHERE entity_id = (SELECT id FROM device_entity WHERE device_id = ? AND entity_id = ?)
  `);

  for (const entityMap of entitiesList) {
    const entityId = str(getEntityField(entityMap, ENTITY_KEYS.ENTITY_ID));
    if (!entityId) continue;

    const name = str(getEntityField(entityMap, ENTITY_KEYS.NAME));
    const type = num(getEntityField(entityMap, ENTITY_KEYS.TYPE));
    const deviceClass = num(getEntityField(entityMap, ENTITY_KEYS.DEVICE_CLASS));
    const unit = str(getEntityField(entityMap, ENTITY_KEYS.UNIT));
    const restoreMode = num(getEntityField(entityMap, ENTITY_KEYS.RESTORE_MODE)) ?? 0;
    const extra: Record<string, unknown> = {};
    for (const k of Object.keys(entityMap)) {
      const n = Number(k);
      if (Number.isNaN(n) || !keySet.has(n)) extra[k] = entityMap[k];
    }
    const attributesJson = Object.keys(extra).length > 0 ? JSON.stringify(extra) : null;

    const prev = db.prepare("SELECT id FROM device_entity WHERE device_id = ? AND entity_id = ?").get(deviceId, entityId) as { id: number } | undefined;
    upsertEntity.run(deviceId, entityId, name, type, deviceClass, unit, attributesJson, restoreMode);
    if (!prev) anyCreated = true;

    restoreState.run(deviceId, entityId);
  }

  const restoreRows = db.prepare(`
    SELECT e.entity_id, e.restore_mode, s.state, s.brightness, s.mode, s.rgb_json, s.color_temp, s.value_real, s.deleted_at
    FROM device_entity e
    LEFT JOIN device_entity_state s ON s.entity_id = e.id
    WHERE e.device_id = ? AND e.deleted_at IS NULL
  `).all(deviceId) as Array<{
    entity_id: string;
    restore_mode: number;
    state: number | null;
    brightness: number | null;
    mode: number | null;
    rgb_json: string | null;
    color_temp: number | null;
    value_real: number | null;
    deleted_at: string | null;
  }>;

  const restore: EntityRestoreItem[] = restoreRows.map((r) => {
    const hasSavedState = r.state != null && r.deleted_at == null;
    return {
      entity_id: r.entity_id,
      restore_mode: r.restore_mode,
      state: r.state,
      brightness: r.brightness,
      mode: r.mode,
      rgb_json: r.rgb_json,
      color_temp: r.color_temp,
      value_real: r.value_real,
      has_saved_state: hasSavedState,
    };
  });

  return { status: anyCreated ? "created" : "changed", restore };
}

/**
 * Update device_entity definition from POST /device/update/entity.
 */
export function updateEntityDefinition(parsed: Record<string, unknown>): void {
  const db = getDatabase();
  const macHex = macAddressToHex(getPayloadField(parsed, DEVICE_REGISTER_KEYS.MAC_ADDRESS));
  const deviceId = resolveDeviceIdByMac(db, macHex);
  if (deviceId == null) throw new Error("device not found for mac_address");

  const arr = getPayloadField<unknown[]>(parsed, DEVICE_REGISTER_KEYS.ENTITIES);
  const entitiesList = Array.isArray(arr) ? arr.filter((e): e is Record<string, unknown> => e != null && typeof e === "object" && !Array.isArray(e)) : [];

  const keySet = new Set<number>(Object.values(ENTITY_KEYS) as number[]);
  const updateStmt = db.prepare(`
    UPDATE device_entity SET name = ?, type = ?, device_class = ?, unit = ?, attributes_json = ?, updated_at = CURRENT_TIMESTAMP
    WHERE device_id = ? AND entity_id = ?
  `);

  for (const entityMap of entitiesList) {
    const entityId = str(getEntityField(entityMap, ENTITY_KEYS.ENTITY_ID));
    if (!entityId) continue;
    const name = str(getEntityField(entityMap, ENTITY_KEYS.NAME));
    const type = num(getEntityField(entityMap, ENTITY_KEYS.TYPE));
    const deviceClass = num(getEntityField(entityMap, ENTITY_KEYS.DEVICE_CLASS));
    const unit = str(getEntityField(entityMap, ENTITY_KEYS.UNIT));
    const extra: Record<string, unknown> = {};
    for (const k of Object.keys(entityMap)) {
      const n = Number(k);
      if (Number.isNaN(n) || !keySet.has(n)) extra[k] = entityMap[k];
    }
    const attributesJson = Object.keys(extra).length > 0 ? JSON.stringify(extra) : null;
    updateStmt.run(name, type, deviceClass, unit, attributesJson, deviceId, entityId);
  }
}

/**
 * Upsert device_entity_state and append history from POST /device/update/state.
 */
export function upsertEntityState(parsed: Record<string, unknown>): void {
  const db = getDatabase();
  const macHex = macAddressToHex(getPayloadField(parsed, DEVICE_REGISTER_KEYS.MAC_ADDRESS));
  const deviceId = resolveDeviceIdByMac(db, macHex);
  if (deviceId == null) throw new Error("device not found for mac_address");

  const arr = getPayloadField<unknown[]>(parsed, DEVICE_REGISTER_KEYS.ENTITIES);
  const entitiesList = Array.isArray(arr) ? arr.filter((e): e is Record<string, unknown> => e != null && typeof e === "object" && !Array.isArray(e)) : [];

  for (const entityMap of entitiesList) {
    const entityIdStr = str(getEntityField(entityMap, ENTITY_KEYS.ENTITY_ID));
    if (!entityIdStr) continue;

    const entityRow = db.prepare("SELECT id FROM device_entity WHERE device_id = ? AND entity_id = ?").get(deviceId, entityIdStr) as { id: number } | undefined;
    if (!entityRow) continue;

    const available = getEntityField<boolean>(entityMap, ENTITY_KEYS.AVAILABLE);
    const availableNum = available === true ? 1 : available === false ? 0 : null;
    const state = getEntityField<boolean>(entityMap, ENTITY_KEYS.STATE);
    const stateNum = state === true ? 1 : state === false ? 0 : num(getEntityField(entityMap, ENTITY_KEYS.STATE));
    const brightness = num(getEntityField(entityMap, ENTITY_KEYS.BRIGHTNESS));
    const mode = num(getEntityField(entityMap, ENTITY_KEYS.MODE));
    const rgb = getEntityField<unknown>(entityMap, ENTITY_KEYS.RGB);
    const rgbJson = Array.isArray(rgb) ? JSON.stringify(rgb) : rgb != null ? JSON.stringify(rgb) : null;
    const colorTemp = num(getEntityField(entityMap, ENTITY_KEYS.COLOR_TEMP));
    const value = getEntityField<number>(entityMap, ENTITY_KEYS.VALUE);
    const valueReal = typeof value === "number" ? value : num(value);

    const existingState = db.prepare("SELECT entity_id FROM device_entity_state WHERE entity_id = ?").get(entityRow.id) as { entity_id: number } | undefined;
    if (existingState) {
      db.prepare(`
        INSERT INTO device_entity_state_history (entity_id, available, state, brightness, mode, rgb_json, color_temp, value_real)
        SELECT entity_id, available, state, brightness, mode, rgb_json, color_temp, value_real FROM device_entity_state WHERE entity_id = ?
      `).run(entityRow.id);
    }

    if (existingState) {
      db.prepare(`
        UPDATE device_entity_state SET available = ?, state = ?, brightness = ?, mode = ?, rgb_json = ?, color_temp = ?, value_real = ?, deleted_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE entity_id = ?
      `).run(availableNum, stateNum, brightness, mode, rgbJson, colorTemp, valueReal, entityRow.id);
    } else {
      db.prepare(`
        INSERT INTO device_entity_state (entity_id, available, state, brightness, mode, rgb_json, color_temp, value_real)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(entityRow.id, availableNum, stateNum, brightness, mode, rgbJson, colorTemp, valueReal);
    }
  }
}
