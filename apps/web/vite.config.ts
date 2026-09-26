import { tanstackRouter } from "@tanstack/router-plugin/vite";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defaultClientConditions, defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const site = new URL(env.VITE_SITE_URL || "http://localhost:3000");
  if (
    !["https:", "http:"].includes(site.protocol) ||
    site.username ||
    site.password ||
    site.pathname !== "/" ||
    site.search ||
    site.hash
  )
    throw new Error("VITE_SITE_URL must be a public origin without a path, credentials or query.");
  const indexable = mode === "production" && site.protocol === "https:";
  const robots = indexable ? "index, follow, max-image-preview:large" : "noindex, nofollow";
  return {
    resolve: { conditions: ["workspace-source", ...defaultClientConditions] },
    plugins: [
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      tailwindcss(),
      react(),
      {
        name: "site-metadata",
        transformIndexHtml: (html: string) =>
          html.replaceAll("__SITE_URL__", site.origin).replaceAll("__ROBOTS__", robots),
        generateBundle() {
          this.emitFile({
            type: "asset",
            fileName: "robots.txt",
            source: indexable
              ? `User-agent: *\nAllow: /\n\nSitemap: ${site.origin}/sitemap.xml\n`
              : "User-agent: *\nDisallow: /\n",
          });
          this.emitFile({
            type: "asset",
            fileName: "sitemap.xml",
            source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${site.origin}/</loc></url></urlset>\n`,
          });
        },
      },
    ],
  };
});
