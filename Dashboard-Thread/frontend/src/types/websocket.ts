/**
 * Types cho WebSocket (backend serial config và status)
 * Một số types đã được move sang shared package
 */

// Re-export từ shared để backward compatibility
export type {
  SerialConfig as SerialConfigFromBackend,
  SerialStatus,
  OtConfig,
  OtThreadState,
  OtTableData,
} from "shared/src/types";

export interface CliResponse {
  id?: string;
  success: boolean;
  command?: string;
  output?: string[];
  error?: string;
}
