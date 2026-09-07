import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { attemptOneTimeSuperAdminBootstrap } from "./supabase";

describe("security remediation policy", () => {
  it("binds a matching bootstrap identity only once and never re-promotes a later demoted profile", async () => {
    const calls: string[] = [];
    let boundUserId: string | null = null;
    let persistedRole: "student" | "super_admin" = "student";
    const invoke = async (userId: string) => {
      calls.push(userId);
      if (boundUserId) return false;
      boundUserId = userId;
      persistedRole = "super_admin";
      return true;
    };
    const profile = { id: "65cd44e6-e1c4-4a50-89d5-5d47fd20f2a2", email: "bootstrap@sakeno.example" };

    await expect(attemptOneTimeSuperAdminBootstrap(profile, "bootstrap@sakeno.example", invoke)).resolves.toBe(true);
    expect(persistedRole).toBe("super_admin");
    persistedRole = "student";
    await expect(attemptOneTimeSuperAdminBootstrap(profile, "bootstrap@sakeno.example", invoke)).resolves.toBe(false);
    expect(persistedRole).toBe("student");
    await expect(attemptOneTimeSuperAdminBootstrap(profile, "different@sakeno.example", invoke)).resolves.toBe(false);
    expect(calls).toEqual([profile.id, profile.id]);
  });

  it("ships a public RPC façade that only service_role can invoke while preserving the private authority", () => {
    const migrationPath = fileURLToPath(
      new URL("../supabase/migrations/20260823151500_super_admin_bootstrap_public_facade.sql", import.meta.url),
    );
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("create or replace function public.bootstrap_super_admin_once(target_user_id uuid)");
    expect(migration).toContain("select private.bootstrap_super_admin_once(target_user_id);");
    expect(migration).toContain("revoke all on function public.bootstrap_super_admin_once(uuid) from public, anon, authenticated;");
    expect(migration).toContain("grant execute on function public.bootstrap_super_admin_once(uuid) to service_role;");
  });
});
