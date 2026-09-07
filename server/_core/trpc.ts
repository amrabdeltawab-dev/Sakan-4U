import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });
export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(({ ctx, next }) => {
  if (!ctx.user || !ctx.supabase) throw new TRPCError({ code: "UNAUTHORIZED", message: "يرجى تسجيل الدخول للمتابعة." });
  return next({ ctx: { ...ctx, user: ctx.user, supabase: ctx.supabase } });
});
export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.user || !["admin", "super_admin"].includes(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "هذه المساحة مخصصة للإدارة." });
  return next();
});

export const superAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user?.appRole !== "super_admin") throw new TRPCError({ code: "FORBIDDEN", message: "هذه العملية تتطلب صلاحية مدير عام." });
  return next();
});
