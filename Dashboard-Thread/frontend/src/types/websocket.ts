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
