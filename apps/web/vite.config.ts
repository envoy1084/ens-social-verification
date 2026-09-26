import { tanstackRouter } from "@tanstack/router-plugin/vite";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), tailwindcss(), react()],
    server: {
      proxy: { "/rpc": { target: env.SERVER_URL || "http://127.0.0.1:8080", changeOrigin: true } },
    },
    preview: {
      proxy: { "/rpc": { target: env.SERVER_URL || "http://127.0.0.1:8080", changeOrigin: true } },
    },
  };
});
