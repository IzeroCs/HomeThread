/**
 * Utility để quản lý cấu hình serial port trong localStorage
 */

export interface SerialConfig {
  serialPort: string;
  baudRate: number;
  commandPrefix: string;
}

const STORAGE_KEY = "serial_config";

export function getSerialConfig(): SerialConfig | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    const config = JSON.parse(stored) as SerialConfig;
    // Validate config
    if (
      typeof config.serialPort === "string" &&
      typeof config.baudRate === "number" &&
      typeof config.commandPrefix === "string"
    ) {
      return config;
    }
  } catch (error) {
    console.error("Failed to parse serial config:", error);
  }

  return null;
}

export function saveSerialConfig(config: SerialConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function clearSerialConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasSerialConfig(): boolean {
  return getSerialConfig() !== null;
}
