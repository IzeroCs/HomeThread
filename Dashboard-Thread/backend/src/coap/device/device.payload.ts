/**
 * Device register payload structure — aligned with Thread-Node cbor_register_keys.h.
 * Backend CBOR decoder (src/cbor) decodes map keys as string ("0", "1", …) for JSON-safe payload.
 */

/** Top-level map keys (same as CBOR_K_* in Thread-Node) */
export const DEVICE_REGISTER_KEYS = {
  DEVICE_ID: 0,
  DEVICE_NAME: 1,
  DEVICE_TYPE: 2,
  MANUFACTURER: 3,
  MODEL: 4,
  SW_VERSION: 5,
  HW_VERSION: 6,
  MAC_ADDRESS: 7,
  NETWORK: 8,
  ENTITIES: 9,
} as const;

/** Network sub-map keys */
export const NETWORK_KEYS = {
  RLOC16: 0,
  ROLE: 1,
  IPV6: 2,
  PARENT: 3,
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

/** Entity map keys (light, sensor, etc.) */
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

export interface DeviceRegisterNetwork {
  0?: number;
  1?: number; // role: 0=child, 1=router, 2=leader
  2?: Uint8Array;
  3?: number;
}

export interface DeviceRegisterPayload {
  0?: string;
  1?: string;
  2?: number;
  3?: string;
  4?: string;
  5?: number;
  6?: number;
  7?: number;
  8?: DeviceRegisterNetwork | Record<number, unknown>;
  9?: unknown[];
}

export function asDeviceRegisterPayload(
  parsed: Record<string, unknown> | null
): DeviceRegisterPayload | null {
  if (!parsed || typeof parsed !== "object") return null;
  return parsed as unknown as DeviceRegisterPayload;
}

export function getPayloadField<T>(obj: Record<string, unknown>, key: number): T | undefined {
  return (obj[String(key)] ?? obj[key as unknown as string]) as T | undefined;
}

/** rloc16 is in network (key 8), sub-key 0 */
export function getRloc16(payload: DeviceRegisterPayload): string {
  const net = getPayloadField<Record<string, unknown>>(
    payload as unknown as Record<string, unknown>,
    DEVICE_REGISTER_KEYS.NETWORK
  );
  if (!net || typeof net !== "object") return "-";
  const rloc = net[String(NETWORK_KEYS.RLOC16)] ?? net[NETWORK_KEYS.RLOC16];
  return rloc != null ? String(rloc) : "-";
}
