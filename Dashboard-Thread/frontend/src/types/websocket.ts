/**
 * Types cho WebSocket (backend serial config và status)
 */

export interface SerialConfigFromBackend {
  id?: number;
  serialPort: string;
  baudRate: number;
  commandPrefix: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SerialStatus {
  isConnected: boolean;
  path: string;
  baudRate: number;
}

export interface CliResponse {
  id?: string;
  success: boolean;
  command?: string;
  output?: string[];
  error?: string;
}

export interface OtConfig {
  panid?: string;
  channel?: number;
  networkName?: string;
  ipaddr?: string;
  datasetActive?: string;
  error?: string;
}

export interface OtThreadState {
  running?: boolean;
  /** Raw state từ thiết bị: leader, router, child, detached, disabled */
  state?: string;
  error?: string;
}

export interface OtTableData {
  headers?: string[];
  rows?: string[][];
  error?: string;
}
