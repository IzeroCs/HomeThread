/**
 * Types cho WebSocket (backend BR connection config và status)
 * Một số types đã được move sang shared package
 */

import type { BrConnectionConfig } from "shared/src/types";

// Re-export từ shared
export type {
  BrConnectionConfig,
  ConnectionStatus,
  OtConfig,
  OtThreadState,
  OtTableData,
} from "shared/src/types";

export type BrConnectionConfigFromBackend = BrConnectionConfig;

export interface CliResponse {
  id?: string;
  success: boolean;
  command?: string;
  output?: string[];
  error?: string;
}
