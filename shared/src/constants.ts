/**
 * Shared constants - validation ranges, limits, etc.
 */

/**
 * BR connection (TCP) constants
 */
export const BR_CONNECTION = {
  DEFAULT_PORT: 5000,
  MIN_PORT: 1,
  MAX_PORT: 65535,
} as const;

/**
 * OpenThread configuration constants
 */
export const OT_CONFIG = {
  MIN_CHANNEL: 11,
  MAX_CHANNEL: 26,
  MIN_PAN_ID: 0x0000,
  MAX_PAN_ID: 0xfffe,
  MAX_NETWORK_NAME_BYTES: 16,
} as const;
