/**
 * Display name helpers: user-set name with fallback to raw (firmware) name.
 * Use when rendering device or entity in UI.
 */

export function deviceDisplayName(device: {
  device_name?: string | null;
  device_name_raw?: string | null;
}): string {
  return device.device_name ?? device.device_name_raw ?? "";
}

export function entityDisplayName(entity: {
  name?: string | null;
  name_raw?: string | null;
}): string {
  return entity.name ?? entity.name_raw ?? "";
}
