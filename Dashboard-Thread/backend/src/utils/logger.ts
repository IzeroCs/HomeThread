/**
 * Logger utility - wrapper dùng pino + pino-pretty. Có thể đổi adapter qua setLogAdapter().
 */

import pino from "pino";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogAdapter {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  log(message: string, ...args: unknown[]): void;
}

const pinoInstance = pino({
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:HH:MM:ss",
      ignore: "pid,hostname",
    },
  },
});

function pinoLog(
  level: "debug" | "info" | "warn" | "error",
  message: string,
  ...args: unknown[]
): void {
  if (args.length === 0) {
    (pinoInstance[level] as (msg: string) => void).call(pinoInstance, message);
  } else {
    (pinoInstance[level] as (obj: object, msg?: string) => void).call(
      pinoInstance,
      { data: args.length === 1 ? args[0] : args },
      message
    );
  }
}

/** Adapter mặc định: pino + pino-pretty. */
const pinoAdapter: LogAdapter = {
  debug: (msg, ...args) => pinoLog("debug", msg, ...args),
  info: (msg, ...args) => pinoLog("info", msg, ...args),
  warn: (msg, ...args) => pinoLog("warn", msg, ...args),
  error: (msg, ...args) => pinoLog("error", msg, ...args),
  log: (msg, ...args) => pinoLog("info", msg, ...args),
};

let currentAdapter: LogAdapter = pinoAdapter;

/** Adapter dùng console (để chuyển tạm hoặc test). */
export const consoleAdapter: LogAdapter = {
  debug: (msg, ...args) => console.debug(msg, ...args),
  info: (msg, ...args) => console.log(msg, ...args),
  warn: (msg, ...args) => console.warn(msg, ...args),
  error: (msg, ...args) => console.error(msg, ...args),
  log: (msg, ...args) => console.log(msg, ...args),
};

/**
 * Gắn adapter log. Gọi 1 lần lúc khởi động nếu muốn đổi (vd. setLogAdapter(consoleAdapter)).
 */
export function setLogAdapter(adapter: LogAdapter): void {
  currentAdapter = adapter;
}

/**
 * Lấy adapter hiện tại (để test hoặc wrap thêm).
 */
export function getLogAdapter(): LogAdapter {
  return currentAdapter;
}

function formatMessage(prefix: string | null, message: string): string {
  return prefix ? `[${prefix}] ${message}` : message;
}

/**
 * Logger có thể có prefix (vd: "Serial", "Frame"). Cùng API với adapter.
 */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  log(message: string, ...args: unknown[]): void;
  /** Tạo logger con với prefix (vd: child("Serial") → "[Serial] ..."). */
  child(prefix: string): Logger;
}

function createLogger(prefix: string | null): Logger {
  const log = (method: keyof LogAdapter) => (message: string, ...args: unknown[]) => {
    (currentAdapter[method] as (m: string, ...a: unknown[]) => void)(formatMessage(prefix, message), ...args);
  };
  return {
    debug: log("debug"),
    info: log("info"),
    warn: log("warn"),
    error: log("error"),
    log: log("log"),
    child: (childPrefix: string) => createLogger(childPrefix),
  };
}

/** Logger gốc (không prefix). */
export const logger: Logger = createLogger(null);

/** Logger có sẵn prefix thường dùng (tuỳ chọn). */
export const serialLogger = logger.child("Serial");
export const frameLogger = logger.child("Frame");
