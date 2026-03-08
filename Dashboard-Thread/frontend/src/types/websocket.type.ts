/**
 * Types cho WebSocket (connection status, OT config, tables).
 * Một số types re-export từ shared package.
 */

// Re-export từ shared
export type {
  ConnectionStatus,
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
