/**
 * WebSocket Message Types
 */

export interface RequestMessage {
  id: string; // Correlation ID for request/response matching
  type: string; // Message type (e.g., "device:getState")
  payload?: any; // Optional payload
}

export interface ResponseMessage {
  id: string; // Correlation ID matching the request
  success: boolean;
  data?: any; // Response data
  error?: string; // Error message if success is false
}

export interface EventMessage {
  type: string; // Event type (e.g., "device:stateChanged")
  data: any; // Event data
  timestamp: number; // Unix timestamp
}

/**
 * Message type guards
 */
export function isRequestMessage(msg: any): msg is RequestMessage {
  return msg && typeof msg.id === 'string' && typeof msg.type === 'string';
}

export function isResponseMessage(msg: any): msg is ResponseMessage {
  return msg && typeof msg.id === 'string' && typeof msg.success === 'boolean';
}

export function isEventMessage(msg: any): msg is EventMessage {
  return msg && typeof msg.type === 'string' && typeof msg.timestamp === 'number';
}
