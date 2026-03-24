/** Namorix Desktop shell origin for CORS / Socket.io (after `load-env`). */
export function resolveDesktopOrigin(): string {
  const explicit = process.env.DESKTOP_ORIGIN?.trim();
  if (explicit) return explicit;
  const port = process.env.DESKTOP_VITE_PORT?.trim() ?? "5173";
  return `http://localhost:${port}`;
}
