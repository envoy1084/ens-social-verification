import { tanstackRouter } from "@tanstack/router-plugin/vite";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defaultClientConditions, defineConfig } from "vite";

export default defineConfig({
  resolve: { conditions: ["workspace-source", ...defaultClientConditions] },
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), tailwindcss(), react()],
});
