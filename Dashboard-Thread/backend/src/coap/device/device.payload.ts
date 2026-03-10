/**
 * Device payload structure — aligned with Thread-Node CBOR key constants.
 * Backend CBOR decoder (src/cbor) decodes map keys as string ("0", "1", …) for JSON-safe payload.
 *
 * Endpoints:
 * - register/info, update/info: DeviceInfoPayload (keys 0–7).
 * - update/topology: mac (7) + key 8 — DeviceTopologyPayload.
 * - register/entity, update/entity: DeviceEntityPayload — mac (7) + key 9 (array DeviceEntityItem).
 * - update/state: DeviceStatePayload — mac (7) + key 9 (array DeviceStateItem).
 */

/** Keys cho payload device_info (register/info, update/info) */
export const DEVICE_INFO_KEYS = {
  DEVICE_ID: 0,
  DEVICE_NAME: 1,
  DEVICE_TYPE: 2,
  MANUFACTURER: 3,
  MODEL: 4,
  SW_VERSION: 5,
  HW_VERSION: 6,
  MAC_ADDRESS: 7,
} as const;

/** Top-level key cho topology (update/topology). Value là object DeviceTopologyPayload. */
export const TOPOLOGY_KEY = 8;

/** Sub-keys của object topology (key 8) */
export const TOPOLOGY_KEYS = {
  RLOC16: 0,
  ROLE: 1,
  IPV6: 2,
  PARENT: 3,
  RSSI: 4,
  LINK_QUALITY: 5,
} as const;

/** Role numeric value: 0=child, 1=router, 2=leader (matches Thread-Node) */
export const ROLE_NAMES: Record<number, string> = {
  0: "child",
  1: "router",
  2: "leader",
};

export function roleToString(role: unknown): string {
  if (typeof role === "number" && role in ROLE_NAMES) return ROLE_NAMES[role];
  return role != null ? String(role) : "-";
}

/** Top-level key cho entities array (register/entity, update/entity, update/state) */
export const ENTITIES_KEY = 9;

/** Entity map keys (light, sensor, etc.) — từng phần tử trong array key 9 */
export const ENTITY_KEYS = {
  ENTITY_ID: 0,
  NAME: 1,
  TYPE: 2,
  DEVICE_CLASS: 3,
  AVAILABLE: 4,
  LAST_UPDATE: 5,
  STATE: 6,
  BRIGHTNESS: 7,
  MODE: 8,
  RGB: 9,
  COLOR_TEMP: 10,
  VALUE: 11,
  UNIT: 12,
  RESTORE_MODE: 13,
} as const;

/** Payload device_info (register/info, update/info): keys 0–7. */
export interface DeviceInfoPayload {
  0?: string; // device_id
  1?: string; // device_name
  2?: number; // device_type
  3?: string; // manufacturer
  4?: string; // model
  5?: number; // sw_version
  6?: number; // hw_version
  7?: number; // mac_address
}

/** Payload device_topology (update/topology): object tại key 8. */
export interface DeviceTopologyPayload {
  0?: number; // rloc16
  1?: number; // role: 0=child, 1=router, 2=leader
  2?: Uint8Array; // ipv6
  3?: number; // parent
  4?: number; // rssi (dBm)
  5?: number; // link_quality (0–255)
}

/** Một phần tử entity trong array key 9 — cho register/entity, update/entity (định nghĩa entity). */
export interface DeviceEntityItem {
  0?: string; // entity_id
  1?: string; // name
  2?: number; // type
  3?: number; // device_class
  12?: string; // unit
  13?: number; // restore_mode
}

/** Payload entity (register/entity, update/entity): mac (7) + key 9 (array định nghĩa entity). */
export interface DeviceEntityPayload {
  7?: number; // mac_address
  9?: DeviceEntityItem[] | unknown[];
}

/** Một phần tử state trong array key 9 — cho update/state. */
export interface DeviceStateItem {
  0?: string; // entity_id
  4?: number; // available (0/1)
  6?: number | boolean; // state
  7?: number; // brightness
  8?: number; // mode
  9?: unknown; // rgb (array hoặc object)
  10?: number; // color_temp
  11?: number; // value
}

/** Payload state (update/state): mac (7) + key 9 (array state từng entity). */
export interface DeviceStatePayload {
  7?: number; // mac_address
  9?: DeviceStateItem[] | unknown[];
}

export function getPayloadField<T>(obj: Record<string, unknown>, key: number): T | undefined {
  return (obj[String(key)] ?? obj[key as unknown as string]) as T | undefined;
}

/** Lấy rloc16 từ payload có topology (key 8). Dùng trong update/topology. */
export function getRloc16FromTopologyPayload(parsed: Record<string, unknown>): string {
  const topology = getPayloadField<Record<string, unknown>>(parsed, TOPOLOGY_KEY);
  if (!topology || typeof topology !== "object") return "-";
  const rloc = topology[String(TOPOLOGY_KEYS.RLOC16)] ?? topology[TOPOLOGY_KEYS.RLOC16];
  return rloc != null ? String(rloc) : "-";
}
