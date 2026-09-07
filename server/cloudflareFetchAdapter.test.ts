import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createSupabaseClients } from "./supabase";
import { createContext } from "./_core/context";

describe("Cloudflare tRPC Fetch Adapter entrypoint", () => {
  it("routes tRPC requests through fetchRequestHandler and preserves dist/public assets fallback", () => {
    const worker = readFileSync(resolve(process.cwd(), "worker/index.ts"), "utf8");
    const wrangler = readFileSync(resolve(process.cwd(), "wrangler.toml"), "utf8");

    expect(worker).toContain('from "@trpc/server/adapters/fetch"');
    expect(worker).toContain("fetchRequestHandler");
    expect(worker).toContain("createContext: (opts) => createContext({ ...opts, env })");
    expect(worker).toContain("if (env?.ASSETS?.fetch) return env.ASSETS.fetch(request)");
    expect(worker).toContain("return fetch(request)");
    expect(worker).toContain("console.error(error)");
    expect(wrangler).toContain('directory = "dist/public"');
  });

  it("creates Supabase clients only from runtime env inside the context path", () => {
    const supabase = readFileSync(resolve(process.cwd(), "server/supabase.ts"), "utf8");
    const context = readFileSync(resolve(process.cwd(), "server/_core/context.ts"), "utf8");

    expect(supabase).toContain("export function createSupabaseClients(env: SupabaseRuntimeEnv)");
    expect(supabase).toContain("createClient(url, serviceRoleKey");
    expect(supabase).toContain("globalFetch = (...args: Parameters<typeof fetch>) => fetch(...args)");
    expect(supabase).toContain("Supabase env bindings are missing in context");
    expect(context).not.toContain("createClient(");
    expect(supabase).not.toContain("process." + "env");
    expect(context).toContain("createSupabaseClients(env)");
    expect(context).toContain("createContext = async ({ req, resHeaders, env }: FetchCreateContextFnOptions & { env: SupabaseRuntimeEnv })");
    expect(context).toContain("createExpressContext");
    expect(context).toContain("createFetchContext(request: Request, env: SupabaseRuntimeEnv)");
    expect(() => createSupabaseClients({ SUPABASE_SERVICE_ROLE_KEY: "server-only" })).toThrowError("Supabase env bindings are missing in context");
    const env = { VITE_SUPABASE_URL: "https://example.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "publishable", SUPABASE_SERVICE_ROLE_KEY: "service-role" };
    return expect(createContext({ req: new Request("https://example.test/api/trpc/auth.me"), resHeaders: new Headers(), env })).resolves.toMatchObject({ env });
  });

  it("wires all requested booking notification transitions through the shared utility", () => {
    const router = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    const worker = readFileSync(resolve(process.cwd(), "worker/index.ts"), "utf8");
    const supabase = readFileSync(resolve(process.cwd(), "server/supabase.ts"), "utf8");
    expect(router).toContain('sendBookingNotification("new_request"');
    expect(router).toContain('sendBookingNotification("accepted"');
    expect(router).toContain('sendBookingNotification("rejected"');
    expect(worker).toContain("SupabaseRuntimeEnv");
    expect(supabase).toContain("RESEND_API_KEY?: string");
  });

  it("logs Fetch Adapter errors in the local Express adapter too", () => {
    const server = readFileSync(resolve(process.cwd(), "server/_core/index.ts"), "utf8");
    expect(server).toContain("onError({ error })");
    expect(server).toContain("console.error(error)");
  });
});
