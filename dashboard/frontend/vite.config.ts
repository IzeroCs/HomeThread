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
    port: 5173,
    host: true, // Lắng nghe trên 0.0.0.0 để truy cập từ LAN (vd. http://<IP-máy>:5173)
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
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://localhost:3000",
        changeOrigin: true,
        ws: true,
        secure: false,
      },
    },
  },
});
