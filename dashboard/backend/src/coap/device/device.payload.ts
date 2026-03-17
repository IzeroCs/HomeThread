/**
 * Device payload structure — aligned with Thread-Node CBOR key constants.
 * Backend CBOR decoder (src/cbor) decodes map keys as string ("0", "1", …) for JSON-safe payload.
 * Mac_address (xác thực thiết bị) luôn ở index 0 khi có trong payload.
 *
 * Endpoints:
 * - register/info, update/info: DeviceInfoPayload (keys 0–6, key 0 = mac).
 * - update/topology: DeviceTopologyPayload — role-based: child has 0,1,2,3,4,5; router/leader have 0,1,2,6 (neighbors).
 * - register/entity, update/entity: key 0 (mac) + key 1 (array DeviceEntityItem).
 * - update/state: key 0 (mac) + key 1 (array DeviceStateItem).
 */

/** Key cho mac_address ở mọi payload có mac (device_info, entity, state, topology). */
export const PAYLOAD_KEY_MAC = 0;

/** Key cho array entity/state (register/entity, update/entity, update/state). Cùng shape: size 2 (0 = mac, 1 = array). */
export const PAYLOAD_KEY_ARRAY = 1;

/** Keys cho payload device_info (register/info, update/info). Index 0 = mac (identifier), 1–6 = thông tin. */
export const DEVICE_INFO_KEYS = {
  MAC_ADDRESS: 0,
  DEVICE_NAME: 1,
  DEVICE_TYPE: 2,
  MANUFACTURER: 3,
  MODEL: 4,
  SW_VERSION: 5,
  HW_VERSION: 6,
} as const;

/** Keys cho payload topology (update/topology). Parse theo role: child dùng 3,4,5 (parent); router/leader dùng 6 (neighbors). */
export const TOPOLOGY_KEYS = {
  MAC_ADDRESS: 0,
  RLOC16: 1,
  ROLE: 2,
  PARENT_RLOC16: 3,
  PARENT_RSSI: 4,
  PARENT_LQ: 5,
  NEIGHBORS: 6,
} as const;

/** Keys cho phần tử neighbor (key 6 array). Router/Leader only. */
export const TOPOLOGY_NEIGHBOR_KEYS = {
  RLOC16: 0,
  RSSI: 1,
  LQ_IN: 2,
  LQ_OUT: 3,
  IS_CHILD: 4,
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

/** Keys cho phần tử entity trong register/entity, update/entity (định nghĩa entity). Index 0–6. */
export const ENTITY_KEYS = {
  ENTITY_ID: 0,
  NAME: 1,
  TYPE: 2,
  DEVICE_CLASS: 3,
  UNIT: 4,
  RESTORE_MODE: 5,
  DISABLED: 6,
} as const;

/** Keys cho phần tử state trong update/state (array key 1). Index 0–6. */
export const STATE_KEYS = {
  ENTITY_ID: 0,
  STATE: 1,
  BRIGHTNESS: 2,
  MODE: 3,
  RGB: 4,
  COLOR_TEMP: 5,
  VALUE: 6,
} as const;

/** Payload device_info (register/info, update/info): keys 0–6 (key 0 = mac identifier). */
export interface DeviceInfoPayload {
  0?: Uint8Array; // mac_address (CBOR bstr(8), EUI-64)
  1?: string; // device_name
  2?: number; // device_type
  3?: string; // manufacturer
  4?: string; // model
  5?: number; // sw_version
  6?: number; // hw_version
}

/** One neighbor in key 6 array (router/leader only). */
export interface DeviceTopologyNeighbor {
  0: number;   // rloc16
  1?: number; // rssi (dBm) — optional if not direct neighbor
  2?: number; // link_quality_in
  3?: number; // link_quality_out
  4: boolean; // is_child
}

/** Payload topology (update/topology): role-based. Child: 0,1,2,3,4,5. Router/Leader: 0,1,2,6. */
export interface DeviceTopologyPayload {
  0?: Uint8Array;   // mac_address (CBOR bstr(8), EUI-64)
  1?: number;   // rloc16
  2?: number;   // role: 0=child, 1=router, 2=leader
  3?: number;   // parent_rloc16 — child only
  4?: number;   // parent_rssi (dBm) — child only
  5?: number;   // parent_lq — child only
  6?: DeviceTopologyNeighbor[]; // router/leader only
}

/** Một phần tử entity trong array key 1 — cho register/entity, update/entity (định nghĩa entity). disabled=1 → không thêm vào dashboard. */
export interface DeviceEntityItem {
  0?: string; // entity_id
  1?: string; // name
  2?: number; // type
  3?: number; // device_class
  4?: string; // unit
  5?: number; // restore_mode
  6?: number; // disabled: 1 = không hiện trên dashboard
}

/** Payload entity (register/entity, update/entity): key 0 (mac) + key 1 (array định nghĩa entity). */
export interface DeviceEntityPayload {
  0?: Uint8Array; // mac_address (CBOR bstr(8), EUI-64)
  1?: DeviceEntityItem[] | unknown[];
}

/** Một phần tử state trong array key 1 — cho update/state. */
export interface DeviceStateItem {
  0?: string; // entity_id
  1?: number | boolean; // state
  2?: number; // brightness
  3?: number; // mode
  4?: unknown; // rgb (array hoặc object)
  5?: number; // color_temp
  6?: number; // value
}

/** Payload state (update/state): key 0 (mac) + key 1 (array state từng entity). */
export interface DeviceStatePayload {
  0?: Uint8Array; // mac_address (CBOR bstr(8), EUI-64)
  1?: DeviceStateItem[] | unknown[];
}

export function getPayloadField<T>(obj: Record<string, unknown>, key: number): T | undefined {
  return (obj[String(key)] ?? obj[key as unknown as string]) as T | undefined;
}
