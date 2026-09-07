import { describe, expect, it } from "vitest";
import { getRuntimeEnvValue } from "./runtimeEnv";

describe("Supabase runtime configuration", () => {
  it("can reach the configured Supabase Auth health endpoint with the configured publishable key", async () => {
    const url = getRuntimeEnvValue("VITE_SUPABASE_URL");
    const publishableKey = getRuntimeEnvValue("VITE_SUPABASE_PUBLISHABLE_KEY");
    const serviceRoleKey = getRuntimeEnvValue("SUPABASE_SERVICE_ROLE_KEY");
    const bootstrapSuperAdminEmail = getRuntimeEnvValue("SUPABASE_BOOTSTRAP_SUPER_ADMIN_EMAIL");

    expect(url).toBeTruthy();
    expect(publishableKey).toBeTruthy();
    expect(serviceRoleKey).toBeTruthy();
    expect(bootstrapSuperAdminEmail).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);

    const response = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: publishableKey! },
    });

    expect(response.ok).toBe(true);
  }, 15_000);
});
