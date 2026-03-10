/**
 * CoAP device & entity — parse payload, gọi device repository (type-safe).
 */

import {
  resolveDeviceIdByMac,
  upsertDeviceInfo as repoUpsertDeviceInfo,
  updateDeviceInfo as repoUpdateDeviceInfo,
  upsertTopology as repoUpsertTopology,
  mergeEntity as repoMergeEntity,
  updateEntityDefinition as repoUpdateEntityDefinition,
  upsertEntityState as repoUpsertEntityState,
  type EntityRestoreItem,
  type UpsertDeviceInfoParams,
  type UpdateDeviceInfoParams,
  type MergeEntityItem,
  type UpdateEntityDefinitionItem,
  type UpsertEntityStateItem,
} from "@database/repositories/device.repository";
import {
  DEVICE_INFO_KEYS,
  TOPOLOGY_KEY,
  TOPOLOGY_KEYS,
  ENTITIES_KEY,
  ENTITY_KEYS,
  getPayloadField,
} from "./device.payload";

export type { EntityRestoreItem };

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

function str(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  return String(v);
}

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

function getEntityField<T>(entity: Record<string, unknown>, key: number): T | undefined {
  return (entity[String(key)] ?? entity[key as unknown as string]) as T | undefined;
}

export function upsertDeviceInfo(parsed: Record<string, unknown>): "created" | "changed" {
  const macHex = macAddressToHex(getPayloadField(parsed, DEVICE_INFO_KEYS.MAC_ADDRESS));
  const params: UpsertDeviceInfoParams = {
    macHex,
    deviceName: str(getPayloadField(parsed, DEVICE_INFO_KEYS.DEVICE_NAME)) ?? null,
    deviceType: num(getPayloadField(parsed, DEVICE_INFO_KEYS.DEVICE_TYPE)) ?? null,
    manufacturer: str(getPayloadField(parsed, DEVICE_INFO_KEYS.MANUFACTURER)) ?? null,
    model: str(getPayloadField(parsed, DEVICE_INFO_KEYS.MODEL)) ?? null,
    swVersion: num(getPayloadField(parsed, DEVICE_INFO_KEYS.SW_VERSION)) ?? null,
    hwVersion: num(getPayloadField(parsed, DEVICE_INFO_KEYS.HW_VERSION)) ?? null,
  };
  return repoUpsertDeviceInfo(params);
}

export function updateDeviceInfo(parsed: Record<string, unknown>): void {
  const macHex = macAddressToHex(getPayloadField(parsed, DEVICE_INFO_KEYS.MAC_ADDRESS));
  const params: UpdateDeviceInfoParams = {
    macHex,
    deviceSlug: str(getPayloadField(parsed, DEVICE_INFO_KEYS.DEVICE_ID)) ?? null,
    deviceName: str(getPayloadField(parsed, DEVICE_INFO_KEYS.DEVICE_NAME)) ?? null,
    deviceType: num(getPayloadField(parsed, DEVICE_INFO_KEYS.DEVICE_TYPE)) ?? null,
    manufacturer: str(getPayloadField(parsed, DEVICE_INFO_KEYS.MANUFACTURER)) ?? null,
    model: str(getPayloadField(parsed, DEVICE_INFO_KEYS.MODEL)) ?? null,
    swVersion: num(getPayloadField(parsed, DEVICE_INFO_KEYS.SW_VERSION)) ?? null,
    hwVersion: num(getPayloadField(parsed, DEVICE_INFO_KEYS.HW_VERSION)) ?? null,
  };
  repoUpdateDeviceInfo(params);
}

export function upsertTopology(parsed: Record<string, unknown>): void {
  const macHex = macAddressToHex(getPayloadField(parsed, DEVICE_INFO_KEYS.MAC_ADDRESS));
  const deviceId = resolveDeviceIdByMac(macHex);
  if (deviceId == null) throw new Error("device not found for mac_address");

  let rloc16: string | null = null;
  let role: number | null = null;
  let parentRloc16: string | null = null;
  let rssi: number | null = null;
  let linkQuality: number | null = null;
  const topology = getPayloadField<Record<string, unknown>>(parsed, TOPOLOGY_KEY);
  if (topology && typeof topology === "object") {
    const rloc = topology[String(TOPOLOGY_KEYS.RLOC16)] ?? topology[TOPOLOGY_KEYS.RLOC16];
    rloc16 = rloc != null ? String(rloc) : null;
    role = num(topology[String(TOPOLOGY_KEYS.ROLE)] ?? topology[TOPOLOGY_KEYS.ROLE]) ?? null;
    const parent = topology[String(TOPOLOGY_KEYS.PARENT)] ?? topology[TOPOLOGY_KEYS.PARENT];
    parentRloc16 = parent != null ? String(parent) : null;
    rssi = num(topology[String(TOPOLOGY_KEYS.RSSI)] ?? topology[TOPOLOGY_KEYS.RSSI]) ?? null;
    linkQuality = num(topology[String(TOPOLOGY_KEYS.LINK_QUALITY)] ?? topology[TOPOLOGY_KEYS.LINK_QUALITY]) ?? null;
  }

  repoUpsertTopology({ deviceId, rloc16, parentRloc16, role, rssi, linkQuality });
}

export function mergeEntity(parsed: Record<string, unknown>): { status: "created" | "changed"; restore: EntityRestoreItem[] } {
  const macHex = macAddressToHex(getPayloadField(parsed, DEVICE_INFO_KEYS.MAC_ADDRESS));
  const deviceId = resolveDeviceIdByMac(macHex);
  if (deviceId == null) throw new Error("device not found for mac_address");

  const arr = getPayloadField<unknown[]>(parsed, ENTITIES_KEY);
  const entitiesList = Array.isArray(arr) ? arr.filter((e): e is Record<string, unknown> => e != null && typeof e === "object" && !Array.isArray(e)) : [];

  const keySet = new Set<number>(Object.values(ENTITY_KEYS) as number[]);
  const entities: MergeEntityItem[] = [];

  for (const entityMap of entitiesList) {
    const entityId = str(getEntityField(entityMap, ENTITY_KEYS.ENTITY_ID));
    if (!entityId) continue;
    const extra: Record<string, unknown> = {};
    for (const k of Object.keys(entityMap)) {
      const n = Number(k);
      if (Number.isNaN(n) || !keySet.has(n)) extra[k] = entityMap[k];
    }
    const attributesJson = Object.keys(extra).length > 0 ? JSON.stringify(extra) : null;
    entities.push({
      entityId,
      name: str(getEntityField(entityMap, ENTITY_KEYS.NAME)) ?? null,
      type: num(getEntityField(entityMap, ENTITY_KEYS.TYPE)) ?? null,
      deviceClass: num(getEntityField(entityMap, ENTITY_KEYS.DEVICE_CLASS)) ?? null,
      unit: str(getEntityField(entityMap, ENTITY_KEYS.UNIT)) ?? null,
      attributesJson,
      restoreMode: num(getEntityField(entityMap, ENTITY_KEYS.RESTORE_MODE)) ?? 0,
    });
  }

  return repoMergeEntity(macHex, deviceId, entities);
}

export function updateEntityDefinition(parsed: Record<string, unknown>): void {
  const macHex = macAddressToHex(getPayloadField(parsed, DEVICE_INFO_KEYS.MAC_ADDRESS));
  const deviceId = resolveDeviceIdByMac(macHex);
  if (deviceId == null) throw new Error("device not found for mac_address");

  const arr = getPayloadField<unknown[]>(parsed, ENTITIES_KEY);
  const entitiesList = Array.isArray(arr) ? arr.filter((e): e is Record<string, unknown> => e != null && typeof e === "object" && !Array.isArray(e)) : [];

  const keySet = new Set<number>(Object.values(ENTITY_KEYS) as number[]);
  const entities: UpdateEntityDefinitionItem[] = [];

  for (const entityMap of entitiesList) {
    const entityId = str(getEntityField(entityMap, ENTITY_KEYS.ENTITY_ID));
    if (!entityId) continue;
    const extra: Record<string, unknown> = {};
    for (const k of Object.keys(entityMap)) {
      const n = Number(k);
      if (Number.isNaN(n) || !keySet.has(n)) extra[k] = entityMap[k];
    }
    const attributesJson = Object.keys(extra).length > 0 ? JSON.stringify(extra) : null;
    entities.push({
      entityId,
      name: str(getEntityField(entityMap, ENTITY_KEYS.NAME)) ?? null,
      type: num(getEntityField(entityMap, ENTITY_KEYS.TYPE)) ?? null,
      deviceClass: num(getEntityField(entityMap, ENTITY_KEYS.DEVICE_CLASS)) ?? null,
      unit: str(getEntityField(entityMap, ENTITY_KEYS.UNIT)) ?? null,
      attributesJson,
    });
  }

  repoUpdateEntityDefinition(deviceId, entities);
}

export function upsertEntityState(parsed: Record<string, unknown>): void {
  const macHex = macAddressToHex(getPayloadField(parsed, DEVICE_INFO_KEYS.MAC_ADDRESS));
  const deviceId = resolveDeviceIdByMac(macHex);
  if (deviceId == null) throw new Error("device not found for mac_address");

  const arr = getPayloadField<unknown[]>(parsed, ENTITIES_KEY);
  const entitiesList = Array.isArray(arr) ? arr.filter((e): e is Record<string, unknown> => e != null && typeof e === "object" && !Array.isArray(e)) : [];

  const items: UpsertEntityStateItem[] = [];

  for (const entityMap of entitiesList) {
    const entityIdStr = str(getEntityField(entityMap, ENTITY_KEYS.ENTITY_ID));
    if (!entityIdStr) continue;

    const available = getEntityField<boolean>(entityMap, ENTITY_KEYS.AVAILABLE);
    const availableNum = available === true ? 1 : available === false ? 0 : null;
    const state = getEntityField<boolean>(entityMap, ENTITY_KEYS.STATE);
    const stateNum = state === true ? 1 : state === false ? 0 : num(getEntityField(entityMap, ENTITY_KEYS.STATE)) ?? null;
    const brightness = num(getEntityField(entityMap, ENTITY_KEYS.BRIGHTNESS)) ?? null;
    const mode = num(getEntityField(entityMap, ENTITY_KEYS.MODE)) ?? null;
    const rgb = getEntityField<unknown>(entityMap, ENTITY_KEYS.RGB);
    const rgbJson = Array.isArray(rgb) ? JSON.stringify(rgb) : rgb != null ? JSON.stringify(rgb) : null;
    const colorTemp = num(getEntityField(entityMap, ENTITY_KEYS.COLOR_TEMP)) ?? null;
    const value = getEntityField<number>(entityMap, ENTITY_KEYS.VALUE);
    const valueReal = typeof value === "number" ? value : num(value) ?? null;

    items.push({
      entityIdStr,
      available: availableNum,
      state: stateNum,
      brightness,
      mode,
      rgbJson,
      colorTemp,
      valueReal,
    });
  }

  repoUpsertEntityState(deviceId, items);
}
