import { ENV } from "./env";

/** Namorix Desktop shell origin for CORS / Socket.io. */
export function resolveDesktopOrigin(): string {
  return ENV.DESKTOP_ORIGIN;
}
