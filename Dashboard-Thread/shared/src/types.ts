/**
 * Shared types - dùng chung cho cả backend và frontend
 */

/**
 * Serial port configuration
 */
export interface SerialConfig {
  id?: number;
  serialPort: string;
  baudRate: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Serial port status
 */
export interface SerialStatus {
  isConnected: boolean;
  path: string;
  baudRate: number;
}

/**
 * OpenThread configuration (dataset fields + additional)
 */
export interface OtConfig {
  // Dataset fields (parsed from TLV)
  activeTimestamp?: string;
  channel?: number;
  wakeUpChannel?: number;
  channelMask?: string;
  extendedPanId?: string;
  meshLocalPrefix?: string;
  networkKey?: string;
  networkName?: string;
  panid?: string;
  pskc?: string;
  securityPolicy?: string;
  // Additional fields
  ipaddr?: string;
  datasetActive?: string; // Hex string gốc (để giữ lại cho compatibility)
  threadVersion?: string;
  error?: string;
}

/**
 * OpenThread thread state
 */
export interface OtThreadState {
  running?: boolean;
  /** Raw state từ thiết bị: leader, router, child, detached, disabled */
  state?: string;
  error?: string;
}

/**
 * Table data (Router Table, Child Table, Joiner Table)
 */
export interface OtTableData {
  headers?: string[];
  rows?: string[][];
  error?: string;
}
