import { describe, expect, it } from "vitest";

describe("SupabaseAuthContext session-expiry handling", () => {
  it("clears the local session and redirects to /login when auth.me returns 401/403", async () => {
    const source = await import("node:fs/promises").then(fs =>
      fs.readFile("client/src/contexts/SupabaseAuthContext.tsx", "utf8"),
    );

    expect(source).toContain("SESSION_EXPIRED_TOAST");
    expect(source).toContain("انتهت جلستك — سجّل دخول مجددًا");
    expect(source).toContain("httpStatus !== 401");
    expect(source).toContain("httpStatus !== 403");
    expect(source).toContain("supabase.auth.signOut()");
    expect(source).toContain('navigate("/login")');
    expect(source).toContain("sessionClearedRef");
  });
});
