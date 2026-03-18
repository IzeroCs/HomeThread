import { defineConfig } from "vite";
import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf-8"));

export default defineConfig({
  plugins: [],
  esbuild: {
    tsconfigRaw: {
      compilerOptions: { experimentalDecorators: true },
    },
  },
  resolve: {
    alias: {
      "@namorix/core": resolve(__dirname, "../vendor/namorix-core/src"),
      "@": resolve(__dirname, "src"),
      "@core": resolve(__dirname, "src/core"),
      "@features": resolve(__dirname, "src/features"),
      "@shared": resolve(__dirname, "src/shared"),
      "@components": resolve(__dirname, "src/features/components"),
      "@monitor": resolve(__dirname, "src/features/monitor"),
      "@nodes": resolve(__dirname, "src/features/nodes"),
      "@joiner": resolve(__dirname, "src/features/joiner"),
      "@settings": resolve(__dirname, "src/features/settings"),
      "@status": resolve(__dirname, "src/features/status"),
      "@topology": resolve(__dirname, "src/features/topology"),
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
      allow: [resolve(__dirname, ".."), resolve(__dirname, "../shared")],
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
