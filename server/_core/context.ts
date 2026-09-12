import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import {
  createSupabaseClients,
  resolveAuthenticatedProfile,
  setSupabaseRuntime,
  supabaseForAccessToken,
  type SakenoProfile,
  type SupabaseRuntimeEnv,
} from "../supabase";
import { setWatermarkServiceConfig } from "../watermark-service/client";

export type TrpcContext = {
  req: unknown;
  res: unknown;
  env: SupabaseRuntimeEnv;
  user: SakenoProfile | null;
  accessToken: string | null;
  supabase: ReturnType<typeof supabaseForAccessToken> | null;
};

type FetchCreateContextFnOptions = {
  req: Request;
  resHeaders: Headers;
};

async function contextFromAccessToken(accessToken: string | null, env: SupabaseRuntimeEnv): Promise<Pick<TrpcContext, "user" | "accessToken" | "supabase">> {
  const clients = setSupabaseRuntime(createSupabaseClients(env));
  setWatermarkServiceConfig(
    env.WATERMARK_SERVICE_URL && env.WATERMARK_SERVICE_SECRET
      ? { url: env.WATERMARK_SERVICE_URL, secret: env.WATERMARK_SERVICE_SECRET }
      : undefined,
  );
  const user = accessToken ? await resolveAuthenticatedProfile(accessToken, clients, env) : null;
  return { user, accessToken, supabase: accessToken ? supabaseForAccessToken(accessToken, clients) : null };
}

export async function createExpressContext(opts: CreateExpressContextOptions, env: SupabaseRuntimeEnv): Promise<TrpcContext> {
  const header = opts.req.headers.authorization;
  const accessToken = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : null;
  return { req: opts.req, res: opts.res, env, ...(await contextFromAccessToken(accessToken, env)) };
}

export const createContext = async ({ req, resHeaders, env }: FetchCreateContextFnOptions & { env: SupabaseRuntimeEnv }): Promise<TrpcContext> => {
  const header = req.headers.get("authorization");
  const accessToken = header?.startsWith("Bearer ") ? header.slice(7) : null;
  return { req, res: resHeaders, env, ...(await contextFromAccessToken(accessToken, env)) };
};

export async function createFetchContext(request: Request, env: SupabaseRuntimeEnv): Promise<TrpcContext> {
  return createContext({ req: request, resHeaders: new Headers(), env });
}
