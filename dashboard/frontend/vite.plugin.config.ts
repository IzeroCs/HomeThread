/**
 * Lib build for Namorix Desktop: single ES module + one CSS file.
 * Run: npm run build:plugin | npm run build:plugin:watch
 */
import { defineConfig } from "vite";
import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf-8"));
const siblingReposRoot = resolve(__dirname, "../../..");
const namorixCoreSrc = resolve(siblingReposRoot, "namorix-core/src");
const namorixAssetsRoot = resolve(siblingReposRoot, "namorix-assets");

/** Output: dashboard/dist/plugin/assets/thread.js + thread.css */
const outDir = resolve(__dirname, "../dist/plugin");

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
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    emptyOutDir: true,
    cssCodeSplit: false,
    outDir,
    lib: {
      entry: resolve(__dirname, "src/thread-plugin-entry.ts"),
      formats: ["es"],
      fileName: "assets/thread",
    },
    rollupOptions: {
      output: {
        /** Prefer one CSS file; other emitted assets keep hashed names */
        assetFileNames: (assetInfo) => {
          const name = assetInfo.names?.[0] ?? assetInfo.name ?? "";
          if (typeof name === "string" && name.endsWith(".css")) {
            return "assets/thread.css";
          }
          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },
});
