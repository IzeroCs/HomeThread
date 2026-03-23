/**
 * Device role (OpenThread): giá trị 1 byte gửi trong CMD_STATE (BR → backend).
 * Copy enum này từ leader (device_role.h) để dùng chung.
 */

export const DEVICE_ROLE = {
  DISABLED: 0,
  DETACHED: 1,
  CHILD: 2,
  ROUTER: 3,
  LEADER: 4,
} as const;

export type DeviceRole = (typeof DEVICE_ROLE)[keyof typeof DEVICE_ROLE];

export const DEVICE_ROLE_NAMES: Record<DeviceRole, string> = {
  [DEVICE_ROLE.DISABLED]: "disabled",
  [DEVICE_ROLE.DETACHED]: "detached",
  [DEVICE_ROLE.CHILD]: "child",
  [DEVICE_ROLE.ROUTER]: "router",
  [DEVICE_ROLE.LEADER]: "leader",
};
