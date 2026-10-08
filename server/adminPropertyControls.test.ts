import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const PROPERTY_ID = "b5f9b244-8161-4dc1-9cfe-8ddc0c45e2e1";

function callerFor(appRole: "student" | "owner" | "admin" | "super_admin") {
  const ctx: TrpcContext = {
    user: { id: "b5f9b244-8161-4dc1-9cfe-8ddc0c45e2e1", name: "Test User", email: "test@example.com", phone: null, appRole, role: appRole === "admin" || appRole === "super_admin" ? "admin" : "user", marketplaceRole: appRole === "owner" ? "owner" : "student" },
    accessToken: "test-token", supabase: {} as never, req: {} as never, res: {} as never,
  };
  return appRouter.createCaller(ctx);
}

const unauthenticatedCaller = appRouter.createCaller({ user: null, accessToken: null, supabase: null, req: {} as never, res: {} as never });

describe("admin property controls — authorization", () => {
  it("blocks unauthenticated callers from all admin property procedures", async () => {
    await expect(unauthenticatedCaller.admin.hideProperty({ propertyId: PROPERTY_ID })).rejects.toThrow();
    await expect(unauthenticatedCaller.admin.unhideProperty({ propertyId: PROPERTY_ID })).rejects.toThrow();
    await expect(unauthenticatedCaller.admin.archiveProperty({ propertyId: PROPERTY_ID })).rejects.toThrow();
    await expect(unauthenticatedCaller.admin.permanentlyDeleteProperty({ propertyId: PROPERTY_ID, confirmName: "test" })).rejects.toThrow();
    await expect(unauthenticatedCaller.admin.allProperties()).rejects.toThrow();
  });

  it("blocks student role from all admin property procedures", async () => {
    await expect(callerFor("student").admin.hideProperty({ propertyId: PROPERTY_ID })).rejects.toThrow("مخصصة للإدارة");
    await expect(callerFor("student").admin.unhideProperty({ propertyId: PROPERTY_ID })).rejects.toThrow("مخصصة للإدارة");
    await expect(callerFor("student").admin.archiveProperty({ propertyId: PROPERTY_ID })).rejects.toThrow("مخصصة للإدارة");
    await expect(callerFor("student").admin.permanentlyDeleteProperty({ propertyId: PROPERTY_ID, confirmName: "test" })).rejects.toThrow("مخصصة للإدارة");
    await expect(callerFor("student").admin.allProperties()).rejects.toThrow("مخصصة للإدارة");
  });

  it("blocks owner role from all admin property procedures", async () => {
    await expect(callerFor("owner").admin.hideProperty({ propertyId: PROPERTY_ID })).rejects.toThrow("مخصصة للإدارة");
    await expect(callerFor("owner").admin.unhideProperty({ propertyId: PROPERTY_ID })).rejects.toThrow("مخصصة للإدارة");
    await expect(callerFor("owner").admin.archiveProperty({ propertyId: PROPERTY_ID })).rejects.toThrow("مخصصة للإدارة");
    await expect(callerFor("owner").admin.permanentlyDeleteProperty({ propertyId: PROPERTY_ID, confirmName: "test" })).rejects.toThrow("مخصصة للإدارة");
    await expect(callerFor("owner").admin.allProperties()).rejects.toThrow("مخصصة للإدارة");
  });

  it("allows admin role to reach the hide procedure (fails on DB, not authz)", async () => {
    await expect(callerFor("admin").admin.hideProperty({ propertyId: PROPERTY_ID })).rejects.toThrow("العقار غير موجود");
  });

  it("allows admin role to reach the archive procedure (fails on DB, not authz)", async () => {
    await expect(callerFor("admin").admin.archiveProperty({ propertyId: PROPERTY_ID })).rejects.toThrow("العقار غير موجود");
  });

  it("allows admin role to reach the permanent delete procedure (fails on DB, not authz)", async () => {
    await expect(callerFor("admin").admin.permanentlyDeleteProperty({ propertyId: PROPERTY_ID, confirmName: "test" })).rejects.toThrow("العقار غير موجود");
  });

  it("allows super_admin role to reach the hide procedure (fails on DB, not authz)", async () => {
    await expect(callerFor("super_admin").admin.hideProperty({ propertyId: PROPERTY_ID })).rejects.toThrow("العقار غير موجود");
  });
});

describe("admin property controls — procedure structure", () => {
  it("exposes all five new procedures on the admin router", () => {
    const caller = callerFor("admin");
    expect(typeof caller.admin.hideProperty).toBe("function");
    expect(typeof caller.admin.unhideProperty).toBe("function");
    expect(typeof caller.admin.archiveProperty).toBe("function");
    expect(typeof caller.admin.permanentlyDeleteProperty).toBe("function");
    expect(typeof caller.admin.allProperties).toBe("function");
  });

  it("requires confirmName for permanent delete (zod validation)", async () => {
    await expect(
      callerFor("admin").admin.permanentlyDeleteProperty({ propertyId: PROPERTY_ID, confirmName: "" } as any),
    ).rejects.toThrow();
  });
});
