/**
 * Client gọi supervisor qua Unix socket /var/run/izerocs/supervisor.sock.
 * Backend chỉ cần gọi requestSupervisor('restart-otbr') hoặc restartOtbr().
 */

import { createConnection } from "net";
import { createInterface } from "readline";

export const SUPERVISOR_SOCK_DIR = process.env.SUPERVISOR_SOCK_DIR ?? "/var/run/izerocs";
const SOCK_PATH = `${SUPERVISOR_SOCK_DIR}/supervisor.sock`;

export function getSupervisorSocketPath(): string {
  return SOCK_PATH;
}

/**
 * Gửi một lệnh tới supervisor, trả về dòng phản hồi (không gồm \n).
 * Reject nếu sock không tồn tại / không kết nối được.
 */
export function requestSupervisor(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = createConnection(SOCK_PATH, () => {
      client.write(cmd + "\n");
    });
    const rl = createInterface({ input: client, crlfDelay: Infinity });
    rl.once("line", (line) => {
      client.destroy();
      resolve(line);
    });
    client.on("error", (err) => {
      client.destroy();
      reject(err);
    });
  });
}

/**
 * Gọi supervisor restart OTBR. Resolve khi thành công, reject khi sock lỗi hoặc supervisor trả error.
 */
export async function restartOtbr(): Promise<void> {
  const res = await requestSupervisor("restart-otbr");
  if (res !== "ok") {
    throw new Error(res.startsWith("error:") ? res.slice(6).trim() : res);
  }
}
