/**
 * Type cho form cấu hình BR (TCP) — dùng chung với backend
 */

import { BR_CONNECTION } from "shared/src/constants";

export interface BrConnectionConfigForm {
  brHost: string;
  brPort: number;
  useMdns?: boolean;
}

export const DEFAULT_BR_CONFIG: BrConnectionConfigForm = {
  brHost: "Thread-Host.local",
  brPort: BR_CONNECTION.DEFAULT_PORT,
  useMdns: true,
};
