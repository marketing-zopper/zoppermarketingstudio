import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Local dev only: serves the files in /api the same way Vercel does in production.
function localApi() {
  return {
    name: "local-api",
    configureServer(server) {
      Object.assign(process.env, loadEnv(server.config.mode, process.cwd(), ""));
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, "http://localhost");
        if (!url.pathname.startsWith("/api/")) return next();
        const file = path.posix.normalize(url.pathname).replace(/^\/+/, "");
        if (file.includes("..") || file.includes("/_lib")) return next();
        try {
          const mod = await server.ssrLoadModule(`/${file}.js`);
          await mod.default(req, res);
        } catch (err) {
          server.config.logger.error(String(err?.stack || err));
          res.statusCode = err?.code === "ERR_LOAD_URL" ? 404 : 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: res.statusCode === 404 ? "Not found" : "Server error" }));
        }
      });
    },
  };
}

export default defineConfig({ plugins: [react(), localApi()] });
