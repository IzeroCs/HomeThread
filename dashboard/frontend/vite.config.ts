import { defineConfig } from "vite";
import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf-8"));
/** Parent of `namorix-thread/` — sibling repos: `namorix-core`, `namorix-assets` (see `namorix-thread.code-workspace`). */
const siblingReposRoot = resolve(__dirname, "../../..");
const namorixCoreSrc = resolve(siblingReposRoot, "namorix-core/src");
const namorixAssetsRoot = resolve(siblingReposRoot, "namorix-assets");

/** OpenThread backend (dashboard/backend). Use 3001 when Desktop already uses 3000. */
const threadBackendPort = process.env.THREAD_BACKEND_PORT ?? "3000";
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
    alias: {
      "@namorix/core": namorixCoreSrc,
      "@namorix/assets": namorixAssetsRoot,
      "@": resolve(__dirname, "src"),
      "@core": resolve(__dirname, "src/core"),
      "@features": resolve(__dirname, "src/features"),
      "@shared": resolve(__dirname, "src/shared"),
      "@network": resolve(__dirname, "src/features/network"),
      "@settings": resolve(__dirname, "src/features/settings"),
      "@styles": resolve(__dirname, "src/styles"),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        loadPaths: [resolve(__dirname, "src"), resolve(__dirname, "../shared/src")],
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version || "0.0.0"),
  },
  server: {
    port: devPort,
    host: true,
    cors: true,
    fs: {
      allow: [
        resolve(__dirname, ".."),
        resolve(__dirname, "../shared"),
        namorixCoreSrc,
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
