import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

/**
 * 主进程策略：
 *  - electron 必须 external（运行时由 electron 二进制提供）
 *  - 其余依赖（@vc/agents @vc/data openai）全部打进 bundle，避免 ESM/CJS 互调坑
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["@vc/agents", "@vc/data", "openai"] })],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/main/index.ts") },
        external: ["electron"],
      },
    },
    resolve: {
      alias: {
        "@vc/agents": resolve(__dirname, "../../packages/agents/src/index.ts"),
        "@vc/data": resolve(__dirname, "../../packages/data/src/index.ts"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/preload/index.ts") },
        external: ["electron"],
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/renderer/index.html") },
      },
    },
  },
});
