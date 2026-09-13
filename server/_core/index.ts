import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createExpressContext } from "./context";
import type { SupabaseRuntimeEnv } from "../supabase";
import { getRuntimeEnvValue } from "../runtimeEnv";
import { getServerListenConfig } from "./serverConfig";
import { serveStatic, setupVite } from "./vite";

const localSupabaseEnv: SupabaseRuntimeEnv = {
  VITE_SUPABASE_URL: getRuntimeEnvValue("VITE_SUPABASE_URL"),
  VITE_SUPABASE_PUBLISHABLE_KEY: getRuntimeEnvValue("VITE_SUPABASE_PUBLISHABLE_KEY"),
  SUPABASE_SERVICE_ROLE_KEY: getRuntimeEnvValue("SUPABASE_SERVICE_ROLE_KEY"),
  SUPABASE_BOOTSTRAP_SUPER_ADMIN_EMAIL: getRuntimeEnvValue("SUPABASE_BOOTSTRAP_SUPER_ADMIN_EMAIL"),
  RESEND_API_KEY: getRuntimeEnvValue("RESEND_API_KEY"),
  WATERMARK_SERVICE_URL: getRuntimeEnvValue("WATERMARK_SERVICE_URL"),
  WATERMARK_SERVICE_SECRET: getRuntimeEnvValue("WATERMARK_SERVICE_SECRET"),
};

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.use(express.json({ limit: "8mb" }));
  app.use(express.urlencoded({ limit: "8mb", extended: true }));
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext: opts => createExpressContext(opts, localSupabaseEnv),
      onError({ error }) {
        console.error(error);
      },
    })
  );
  // development mode uses Vite, production mode uses static files
  if (getRuntimeEnvValue("NODE_ENV") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const { host, port } = getServerListenConfig();
  server.listen(port, host, () => {
    console.log(`Server running on http://${host}:${port}/`);
  });
}

startServer().catch(console.error);
