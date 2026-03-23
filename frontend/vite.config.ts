import { defineConfig } from "vite";
import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf-8"));
/** Workspace root (`namorix-workspace/`) — contains sibling repos `namorix` and `namorix-assets`. */
const siblingReposRoot = resolve(__dirname, "../..");
const namorixCoreSrc = resolve(siblingReposRoot, "namorix/core/frontend/src");
const namorixCoreSharedSrc = resolve(
  siblingReposRoot,
  "namorix/core/shared/src/index.ts",
);
const namorixAssetsRoot = resolve(siblingReposRoot, "namorix-assets");

/** OpenThread backend (dashboard/backend). Default 4000 — same as plugin static + WS origin for Namorix Desktop. */
const threadBackendPort = process.env.THREAD_BACKEND_PORT ?? "4000";
const threadBackendTarget = `http://127.0.0.1:${threadBackendPort}`;

/** Shell plugin dev: `VITE_DEV_PORT=4000 npm run dev` — manifest + assets for Namorix Desktop. */
const devPort = Number(process.env.VITE_DEV_PORT ?? 5173);

export default defineConfig({
  plugins: [],
  esbuild: {
    tsconfigRaw: {
      compilerOptions: { experimentalDecorators: true },
    },
  },
  resolve: {
    alias: [
      { find: "@namorix/core/styles", replacement: resolve(namorixCoreSrc, "styles") },
      { find: "@namorix/core/ws", replacement: resolve(namorixCoreSrc, "ws/index.ts") },
      { find: "@namorix/core/shell-api", replacement: resolve(namorixCoreSrc, "shell-api/index.ts") },
      { find: "@namorix/core/store", replacement: resolve(namorixCoreSrc, "store/index.ts") },
      {
        find: "@namorix/core/components",
        replacement: resolve(namorixCoreSrc, "components"),
      },
      { find: "@namorix/core/i18n", replacement: resolve(namorixCoreSrc, "i18n/index.ts") },
      { find: "@namorix/core", replacement: resolve(namorixCoreSrc, "index.ts") },
      { find: "@namorix/core-shared", replacement: namorixCoreSharedSrc },
      { find: "@namorix/assets", replacement: namorixAssetsRoot },
      { find: "@", replacement: resolve(__dirname, "src") },
      { find: "@core", replacement: resolve(__dirname, "src/core") },
      { find: "@features", replacement: resolve(__dirname, "src/features") },
      { find: "@shared", replacement: resolve(__dirname, "src/shared") },
      { find: "@network", replacement: resolve(__dirname, "src/features/network") },
      { find: "@settings", replacement: resolve(__dirname, "src/features/settings") },
      { find: "@styles", replacement: resolve(__dirname, "src/styles") },
    ],
  },
  css: {
    preprocessorOptions: {
      scss: {
        loadPaths: [
          resolve(__dirname, "src"),
          resolve(__dirname, "../shared/src"),
          namorixCoreSrc,
        ],
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version || "0.0.0"),
  },
  server: {
    port: devPort,
    host: true,
    cors: {
      origin: process.env.DESKTOP_ORIGIN ?? true,
      credentials: true,
    },
    fs: {
      allow: [
        resolve(__dirname, ".."),
        resolve(__dirname, "../shared"),
        namorixCoreSrc,
        resolve(siblingReposRoot, "namorix/core/shared"),
        namorixAssetsRoot,
      ],
    },
    proxy: {
      "/api": {
        target: threadBackendTarget,
        changeOrigin: true,
      },
      "/socket.io": {
        target: threadBackendTarget,
        changeOrigin: true,
        ws: true,
        secure: false,
      },
    },
  },
});
