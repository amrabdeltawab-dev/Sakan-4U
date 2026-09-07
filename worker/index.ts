import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../server/routers";
import { createContext } from "../server/_core/context";
import type { SupabaseRuntimeEnv } from "../server/supabase";

type CloudflareEnv = SupabaseRuntimeEnv & {
  ASSETS?: {
    fetch(request: Request): Promise<Response>;
  };
};

const TRPC_PREFIX = "/api/trpc";

function isTrpcRequest(request: Request) {
  const { pathname } = new URL(request.url);
  return pathname === TRPC_PREFIX || pathname.startsWith(`${TRPC_PREFIX}/`);
}

export default {
  async fetch(request: Request, env: CloudflareEnv, _ctx: ExecutionContext): Promise<Response> {
    if (isTrpcRequest(request)) {
      return fetchRequestHandler({
        endpoint: TRPC_PREFIX,
        req: request,
        router: appRouter,
        createContext: (opts) => createContext({ ...opts, env }),
        onError({ error }) {
          console.error(error);
        },
      });
    }

    if (env?.ASSETS?.fetch) return env.ASSETS.fetch(request);
    return fetch(request);
  },
};
