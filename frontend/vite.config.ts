import { defineConfig, loadEnv } from "vite";
import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf-8"));
/** Repo root (`namorix-thread/`). */
const repoRoot = resolve(__dirname, "..");
/** Workspace root (`namorix-workspace/`) — contains sibling repos `namorix` and `namorix-assets`. */
const siblingReposRoot = resolve(__dirname, "../..");
const namorixCoreSrc = resolve(siblingReposRoot, "namorix/core/frontend/src");
const namorixCoreSharedSrc = resolve(
  siblingReposRoot,
  "namorix/core/shared/src/index.ts",
);
const namorixAssetsRoot = resolve(siblingReposRoot, "namorix-assets");

function resolveDesktopOriginForVite(env: Record<string, string>): string {
  const o = env.DESKTOP_ORIGIN?.trim();
  if (o) return o;
  const p = env.DESKTOP_VITE_PORT?.trim() ?? "5173";
  return `http://localhost:${p}`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, "");
  const backendPort = env.PORT || env.THREAD_BACKEND_PORT || "4000";
  const threadBackendTarget = `http://127.0.0.1:${backendPort}`;
  const threadVitePort = Number(env.THREAD_VITE_PORT ?? env.VITE_DEV_PORT ?? 5180);
  const desktopOrigin = resolveDesktopOriginForVite(env);

  return {
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
    port: threadVitePort,
    host: true,
    cors: {
      origin: desktopOrigin,
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
};
});
