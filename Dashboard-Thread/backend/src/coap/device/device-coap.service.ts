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
  type TopologyNeighborItem,
  type UpsertDeviceInfoParams,
  type UpdateDeviceInfoParams,
  type MergeEntityItem,
  type UpdateEntityDefinitionItem,
  type UpsertEntityStateItem,
} from "@database/repositories/device.repository";
import {
  DEVICE_INFO_KEYS,
  PAYLOAD_KEY_MAC,
  PAYLOAD_KEY_ARRAY,
  TOPOLOGY_KEYS,
  TOPOLOGY_NEIGHBOR_KEYS,
  ENTITY_KEYS,
  STATE_KEYS,
  getPayloadField,
} from "./device.payload";

export type { EntityRestoreItem };

export type DeviceRecord = {
  id: number;
  mac_address: string;
  device_slug: string | null;
  device_name: string | null;
  device_name_raw: string | null;
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
  name_raw: string | null;
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

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, "0");
  }
  return out.toLowerCase();
}

function asUint8Array(v: unknown): Uint8Array | null {
  if (v == null) return null;
  if (v instanceof Uint8Array) return v;
  // Some decoders may return ArrayBuffer for bstr
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  // Buffer is a Uint8Array subclass; covered above, but keep explicit for clarity
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maybeBuf = v as any;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer?.(maybeBuf)) return maybeBuf as Uint8Array;
  return null;
}

/** Convert payload mac_address (CBOR bstr(8), EUI-64) to 16-char hex string. Throws if missing/invalid. */
export function macAddressToHex(v: unknown): string {
  const bytes = asUint8Array(v);
  if (!bytes) throw new Error("mac_address (key 0) must be CBOR bstr(8)");
  if (bytes.length !== 8) throw new Error(`mac_address (key 0) invalid length=${bytes.length}, expected 8`);
  return bytesToHex(bytes);
}

function getEntityField<T>(entity: Record<string, unknown>, key: number): T | undefined {
  return (entity[String(key)] ?? entity[key as unknown as string]) as T | undefined;
}

export function upsertDeviceInfo(parsed: Record<string, unknown>): "created" | "changed" {
  const macHex = macAddressToHex(getPayloadField(parsed, DEVICE_INFO_KEYS.MAC_ADDRESS));
  const deviceNameFromPayload = str(getPayloadField(parsed, DEVICE_INFO_KEYS.DEVICE_NAME)) ?? null;
  const params: UpsertDeviceInfoParams = {
    macHex,
    deviceName: deviceNameFromPayload,
    deviceNameRaw: deviceNameFromPayload,
    deviceType: num(getPayloadField(parsed, DEVICE_INFO_KEYS.DEVICE_TYPE)) ?? null,
    isBorderRouter: 0,
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
    deviceSlug: null,
    deviceName: str(getPayloadField(parsed, DEVICE_INFO_KEYS.DEVICE_NAME)) ?? null,
    deviceType: num(getPayloadField(parsed, DEVICE_INFO_KEYS.DEVICE_TYPE)) ?? null,
    isBorderRouter: 0,
    manufacturer: str(getPayloadField(parsed, DEVICE_INFO_KEYS.MANUFACTURER)) ?? null,
    model: str(getPayloadField(parsed, DEVICE_INFO_KEYS.MODEL)) ?? null,
    swVersion: num(getPayloadField(parsed, DEVICE_INFO_KEYS.SW_VERSION)) ?? null,
    hwVersion: num(getPayloadField(parsed, DEVICE_INFO_KEYS.HW_VERSION)) ?? null,
  };
  repoUpdateDeviceInfo(params);
}

function parseTopologyNeighbors(arr: unknown[]): TopologyNeighborItem[] {
  const out: TopologyNeighborItem[] = [];
  for (const item of arr) {
    if (item == null || typeof item !== "object" || Array.isArray(item)) continue;
    const map = item as Record<string, unknown>;
    const rloc = getPayloadField<unknown>(map, TOPOLOGY_NEIGHBOR_KEYS.RLOC16);
    if (rloc == null) continue;
    const neighborRloc16 = String(rloc);
    const isChildVal = getPayloadField<unknown>(map, TOPOLOGY_NEIGHBOR_KEYS.IS_CHILD);
    const isChild = isChildVal === true || isChildVal === 1;
    out.push({
      neighborRloc16,
      rssi: num(getPayloadField(map, TOPOLOGY_NEIGHBOR_KEYS.RSSI)) ?? null,
      lqIn: num(getPayloadField(map, TOPOLOGY_NEIGHBOR_KEYS.LQ_IN)) ?? null,
      lqOut: num(getPayloadField(map, TOPOLOGY_NEIGHBOR_KEYS.LQ_OUT)) ?? null,
      isChild,
    });
  }
  return out;
}

export function upsertTopology(parsed: Record<string, unknown>): void {
  const macHex = macAddressToHex(getPayloadField(parsed, TOPOLOGY_KEYS.MAC_ADDRESS));
  const deviceId = resolveDeviceIdByMac(macHex);
  if (deviceId == null) throw new Error("device not found for mac_address");

  const rloc = getPayloadField<unknown>(parsed, TOPOLOGY_KEYS.RLOC16);
  const rloc16 = rloc != null ? String(rloc) : null;
  const role = num(getPayloadField(parsed, TOPOLOGY_KEYS.ROLE)) ?? null;

  let parentRloc16: string | null = null;
  let rssi: number | null = null;
  let linkQuality: number | null = null;
  let neighbors: TopologyNeighborItem[] = [];

  if (role === 0) {
    const parent = getPayloadField<unknown>(parsed, TOPOLOGY_KEYS.PARENT_RLOC16);
    parentRloc16 = parent != null ? String(parent) : null;
    rssi = num(getPayloadField(parsed, TOPOLOGY_KEYS.PARENT_RSSI)) ?? null;
    linkQuality = num(getPayloadField(parsed, TOPOLOGY_KEYS.PARENT_LQ)) ?? null;
  } else if (role === 1 || role === 2) {
    const arr = getPayloadField<unknown>(parsed, TOPOLOGY_KEYS.NEIGHBORS);
    neighbors = Array.isArray(arr) ? parseTopologyNeighbors(arr) : [];
  }

  repoUpsertTopology({ deviceId, rloc16, parentRloc16, role, rssi, linkQuality, neighbors });
}

export function mergeEntity(parsed: Record<string, unknown>): { status: "created" | "changed"; restore: EntityRestoreItem[] } {
  const macHex = macAddressToHex(getPayloadField(parsed, PAYLOAD_KEY_MAC));
  const deviceId = resolveDeviceIdByMac(macHex);
  if (deviceId == null) throw new Error("device not found for mac_address");

  const arr = getPayloadField<unknown[]>(parsed, PAYLOAD_KEY_ARRAY);
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
    const disabled = num(getEntityField(entityMap, ENTITY_KEYS.DISABLED)) ?? 0;
    const nameFromPayload = str(getEntityField(entityMap, ENTITY_KEYS.NAME)) ?? null;
    entities.push({
      entityId,
      name: nameFromPayload,
      nameRaw: nameFromPayload,
      type: num(getEntityField(entityMap, ENTITY_KEYS.TYPE)) ?? null,
      deviceClass: num(getEntityField(entityMap, ENTITY_KEYS.DEVICE_CLASS)) ?? null,
      unit: str(getEntityField(entityMap, ENTITY_KEYS.UNIT)) ?? null,
      attributesJson,
      restoreMode: num(getEntityField(entityMap, ENTITY_KEYS.RESTORE_MODE)) ?? 0,
      disabled: disabled ? 1 : 0,
    });
  }

  return repoMergeEntity(macHex, deviceId, entities);
}

export function updateEntityDefinition(parsed: Record<string, unknown>): void {
  const macHex = macAddressToHex(getPayloadField(parsed, PAYLOAD_KEY_MAC));
  const deviceId = resolveDeviceIdByMac(macHex);
  if (deviceId == null) throw new Error("device not found for mac_address");

  const arr = getPayloadField<unknown[]>(parsed, PAYLOAD_KEY_ARRAY);
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
    const disabled = num(getEntityField(entityMap, ENTITY_KEYS.DISABLED)) ?? 0;
    entities.push({
      entityId,
      name: str(getEntityField(entityMap, ENTITY_KEYS.NAME)) ?? null,
      type: num(getEntityField(entityMap, ENTITY_KEYS.TYPE)) ?? null,
      deviceClass: num(getEntityField(entityMap, ENTITY_KEYS.DEVICE_CLASS)) ?? null,
      unit: str(getEntityField(entityMap, ENTITY_KEYS.UNIT)) ?? null,
      attributesJson,
      disabled: disabled ? 1 : 0,
    });
  }

  repoUpdateEntityDefinition(deviceId, entities);
}

export function upsertEntityState(parsed: Record<string, unknown>): void {
  const macHex = macAddressToHex(getPayloadField(parsed, PAYLOAD_KEY_MAC));
  const deviceId = resolveDeviceIdByMac(macHex);
  if (deviceId == null) throw new Error("device not found for mac_address");

  const arr = getPayloadField<unknown[]>(parsed, PAYLOAD_KEY_ARRAY);
  const entitiesList = Array.isArray(arr) ? arr.filter((e): e is Record<string, unknown> => e != null && typeof e === "object" && !Array.isArray(e)) : [];

  const items: UpsertEntityStateItem[] = [];

  for (const entityMap of entitiesList) {
    const entityIdStr = str(getEntityField(entityMap, STATE_KEYS.ENTITY_ID));
    if (!entityIdStr) continue;

    const state = getEntityField<boolean>(entityMap, STATE_KEYS.STATE);
    const stateNum = state === true ? 1 : state === false ? 0 : num(getEntityField(entityMap, STATE_KEYS.STATE)) ?? null;
    const brightness = num(getEntityField(entityMap, STATE_KEYS.BRIGHTNESS)) ?? null;
    const mode = num(getEntityField(entityMap, STATE_KEYS.MODE)) ?? null;
    const rgb = getEntityField<unknown>(entityMap, STATE_KEYS.RGB);
    const rgbJson = Array.isArray(rgb) ? JSON.stringify(rgb) : rgb != null ? JSON.stringify(rgb) : null;
    const colorTemp = num(getEntityField(entityMap, STATE_KEYS.COLOR_TEMP)) ?? null;
    const value = getEntityField<number>(entityMap, STATE_KEYS.VALUE);
    const valueReal = typeof value === "number" ? value : num(value) ?? null;

    items.push({
      entityIdStr,
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
