import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

describe("Supabase-backed session API", () => {
  it("keeps logout a client-side Supabase sign-out operation while the public API remains safe", async () => {
    const caller = appRouter.createCaller({ user: null, accessToken: null, supabase: null, req: {} as never, res: {} as never });
    await expect(caller.auth.me()).resolves.toBeNull();
    await expect(caller.auth.logout()).resolves.toEqual({ success: true });
  });
});
