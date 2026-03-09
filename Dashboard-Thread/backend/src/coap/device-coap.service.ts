/**
 * CoAP device & entity store — create/update device (POST /device/register),
 * merge entities (POST /device/entities). Persists to SQLite.
 */

import { getDatabase } from "@database/database.db";
import {
  DEVICE_REGISTER_KEYS,
  NETWORK_KEYS,
  ENTITY_KEYS,
  getPayloadField,
} from "./device-register.payload";

export type DeviceRecord = {
  device_id: string;
  device_name: string | null;
  device_type: number | null;
  manufacturer: string | null;
  model: string | null;
  sw_version: number | null;
  hw_version: number | null;
  mac_address: number | null;
  rloc16: string | null;
  role: number | null;
  ipv6_blob: Buffer | null;
  parent_rloc16: number | null;
  source_address: string | null;
  updated_at: string;
};

export type EntityRecord = {
  device_id: string;
  entity_id: string;
  name: string | null;
  type: number | null;
  device_class: number | null;
  available: number | null;
  last_update: number | null;
  state: number | null;
  brightness: number | null;
  mode: number | null;
  rgb_json: string | null;
  color_temp: number | null;
  value_real: number | null;
  unit: string | null;
  attributes_json: string | null;
  updated_at: string;
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

/**
 * Upsert device from parsed CBOR (keys 0–8 only). Use device_id as key; store source_address for reference.
 * Returns 'created' | 'changed' for response code (2.01 vs 2.04).
 */
export function upsertDevice(
  parsed: Record<string, unknown>,
  sourceAddress: string | null
): "created" | "changed" {
  const db = getDatabase();
  const deviceId = str(getPayloadField(parsed, DEVICE_REGISTER_KEYS.DEVICE_ID));
  if (!deviceId) {
    throw new Error("device_id (key 0) is required");
  }

  const deviceName = str(getPayloadField(parsed, DEVICE_REGISTER_KEYS.DEVICE_NAME));
  const deviceType = num(getPayloadField(parsed, DEVICE_REGISTER_KEYS.DEVICE_TYPE));
  const manufacturer = str(getPayloadField(parsed, DEVICE_REGISTER_KEYS.MANUFACTURER));
  const model = str(getPayloadField(parsed, DEVICE_REGISTER_KEYS.MODEL));
  const swVersion = num(getPayloadField(parsed, DEVICE_REGISTER_KEYS.SW_VERSION));
  const hwVersion = num(getPayloadField(parsed, DEVICE_REGISTER_KEYS.HW_VERSION));
  const macAddress = num(getPayloadField(parsed, DEVICE_REGISTER_KEYS.MAC_ADDRESS));

  let rloc16: string | null = null;
  let role: number | null = null;
  let ipv6Blob: Buffer | null = null;
  let parentRloc16: number | null = null;
  const network = getPayloadField<Record<string, unknown>>(parsed, DEVICE_REGISTER_KEYS.NETWORK);
  if (network && typeof network === "object") {
    const rloc = network[String(NETWORK_KEYS.RLOC16)] ?? network[NETWORK_KEYS.RLOC16];
    rloc16 = rloc != null ? String(rloc) : null;
    role = num(network[String(NETWORK_KEYS.ROLE)] ?? network[NETWORK_KEYS.ROLE]);
    const ipv6 = network[String(NETWORK_KEYS.IPV6)] ?? network[NETWORK_KEYS.IPV6];
    if (ipv6 instanceof Uint8Array) ipv6Blob = Buffer.from(ipv6);
    else if (Buffer.isBuffer(ipv6)) ipv6Blob = ipv6;
    parentRloc16 = num(network[String(NETWORK_KEYS.PARENT)] ?? network[NETWORK_KEYS.PARENT]);
  }

  const existing = db
    .prepare(
      "SELECT device_id FROM device_info WHERE device_id = ?"
    )
    .get(deviceId) as { device_id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE device_info SET
        device_name = ?, device_type = ?, manufacturer = ?, model = ?,
        sw_version = ?, hw_version = ?, mac_address = ?,
        rloc16 = ?, role = ?, ipv6_blob = ?, parent_rloc16 = ?, source_address = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE device_id = ?`
    ).run(
      deviceName,
      deviceType,
      manufacturer,
      model,
      swVersion,
      hwVersion,
      macAddress,
      rloc16,
      role,
      ipv6Blob,
      parentRloc16,
      sourceAddress,
      deviceId
    );
    return "changed";
  }

  db.prepare(
    `INSERT INTO device_info (
      device_id, device_name, device_type, manufacturer, model,
      sw_version, hw_version, mac_address,
      rloc16, role, ipv6_blob, parent_rloc16, source_address
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    deviceId,
    deviceName,
    deviceType,
    manufacturer,
    model,
    swVersion,
    hwVersion,
    macAddress,
    rloc16,
    role,
    ipv6Blob,
    parentRloc16,
    sourceAddress
  );
  return "created";
}

/**
 * Get entity map value by key (number or string key).
 */
function getEntityField<T>(entity: Record<string, unknown>, key: number): T | undefined {
  return (entity[String(key)] ?? entity[key as unknown as string]) as T | undefined;
}

/**
 * Merge one entity into store (insert or update by device_id + entity_id).
 * Returns 'created' | 'changed'.
 */
export function mergeEntity(
  deviceId: string,
  entityMap: Record<string, unknown>
): "created" | "changed" {
  const db = getDatabase();
  const entityId = str(getEntityField(entityMap, ENTITY_KEYS.ENTITY_ID));
  if (!entityId) return "changed"; // skip if no entity_id

  const name = str(getEntityField(entityMap, ENTITY_KEYS.NAME));
  const type = num(getEntityField(entityMap, ENTITY_KEYS.TYPE));
  const deviceClass = num(getEntityField(entityMap, ENTITY_KEYS.DEVICE_CLASS));
  const available = getEntityField<boolean>(entityMap, ENTITY_KEYS.AVAILABLE);
  const availableNum = available === true ? 1 : available === false ? 0 : null;
  const lastUpdate = num(getEntityField(entityMap, ENTITY_KEYS.LAST_UPDATE));
  const state = getEntityField<boolean>(entityMap, ENTITY_KEYS.STATE);
  const stateNum = state === true ? 1 : state === false ? 0 : num(getEntityField(entityMap, ENTITY_KEYS.STATE));
  const brightness = num(getEntityField(entityMap, ENTITY_KEYS.BRIGHTNESS));
  const mode = num(getEntityField(entityMap, ENTITY_KEYS.MODE));
  const rgb = getEntityField<unknown>(entityMap, ENTITY_KEYS.RGB);
  const rgbJson = Array.isArray(rgb) ? JSON.stringify(rgb) : rgb != null ? JSON.stringify(rgb) : null;
  const colorTemp = num(getEntityField(entityMap, ENTITY_KEYS.COLOR_TEMP));
  const value = getEntityField<number>(entityMap, ENTITY_KEYS.VALUE);
  const valueReal = typeof value === "number" ? value : num(value);
  const unit = str(getEntityField(entityMap, ENTITY_KEYS.UNIT));

  // Optional: store extra attributes as JSON
  const keySet = new Set<number>(Object.values(ENTITY_KEYS) as number[]);
  const extra: Record<string, unknown> = {};
  for (const k of Object.keys(entityMap)) {
    const n = Number(k);
    if (Number.isNaN(n) || !keySet.has(n)) extra[k] = entityMap[k];
  }
  const attributesJson = Object.keys(extra).length > 0 ? JSON.stringify(extra) : null;

  const existing = db
    .prepare(
      "SELECT entity_id FROM device_entity WHERE device_id = ? AND entity_id = ?"
    )
    .get(deviceId, entityId) as { entity_id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE device_entity SET
        name = ?, type = ?, device_class = ?, available = ?, last_update = ?,
        state = ?, brightness = ?, mode = ?, rgb_json = ?, color_temp = ?, value_real = ?, unit = ?,
        attributes_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE device_id = ? AND entity_id = ?`
    ).run(
      name,
      type,
      deviceClass,
      availableNum,
      lastUpdate,
      stateNum,
      brightness,
      mode,
      rgbJson,
      colorTemp,
      valueReal,
      unit,
      attributesJson,
      deviceId,
      entityId
    );
    return "changed";
  }

  db.prepare(
    `INSERT INTO device_entity (
      device_id, entity_id, name, type, device_class, available, last_update,
      state, brightness, mode, rgb_json, color_temp, value_real, unit, attributes_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    deviceId,
    entityId,
    name,
    type,
    deviceClass,
    availableNum,
    lastUpdate,
    stateNum,
    brightness,
    mode,
    rgbJson,
    colorTemp,
    valueReal,
    unit,
    attributesJson
  );
  return "created";
}
