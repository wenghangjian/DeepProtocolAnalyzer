import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";

export default defineConfig({
  resolve: {
    extensions: [".ts", ".tsx", ".mts", ".js", ".jsx", ".json"]
  },
  plugins: [
    react(),
    electron([
      {
        entry: "apps/main/index.ts",
        vite: {
          build: {
            outDir: "dist/main",
            rollupOptions: {
              external: ["electron", "serialport", "fs/promises", "electron-log", "path", "fs", "net", "dgram", "child_process", "os", "util", "events", "http", "https", "url"],
              output: { exports: "auto" }
            }
          }
        }
      },
      {
        entry: "apps/preload/index.ts",
        onstart(options) { options.reload(); },
        vite: {
          build: {
            outDir: "dist/preload",
            rollupOptions: { external: ["electron"] }
          }
        }
      },
      {
        entry: "apps/protocol-worker/index.ts",
        vite: {
          build: {
            outDir: "dist/protocol-worker",
            rollupOptions: { external: ["worker_threads", "serialport", "net", "dgram"] }
          }
        }
      }
    ]),
    renderer()
  ],
  base: "./",
  build: { outDir: "dist/renderer" }
});
