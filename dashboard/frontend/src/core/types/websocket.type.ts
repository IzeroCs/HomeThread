/**
 * Types cho WebSocket (backend BR connection config và status)
 * Một số types đã được move sang shared package
 */

// Re-export từ shared
export type {
  BrConnectionConfig,
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
