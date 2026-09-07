import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function callerFor(appRole: "student" | "owner" | "admin" | "super_admin") {
  const ctx: TrpcContext = {
    user: { id: "b5f9b244-8161-4dc1-9cfe-8ddc0c45e2e1", name: "Test User", email: "test@example.com", phone: null, appRole, role: appRole === "admin" || appRole === "super_admin" ? "admin" : "user", marketplaceRole: appRole === "owner" ? "owner" : "student" },
    accessToken: "test-token", supabase: {} as never, req: {} as never, res: {} as never,
  };
  return appRouter.createCaller(ctx);
}

describe("SAKENO server-side role policy", () => {
  it("blocks unauthenticated callers from creating a booking before any data operation runs", async () => {
    const publicCaller = appRouter.createCaller({ user: null, accessToken: null, supabase: null, req: {} as never, res: {} as never });
    await expect(publicCaller.bookings.create({ propertyId: "b5f9b244-8161-4dc1-9cfe-8ddc0c45e2e1", requestedViewingAt: "2030-01-01T12:00:00.000Z", name: "اختبار", phone: "01000000000", peopleCount: 1, termsAccepted: true })).rejects.toThrow();
  });

  it("blocks owner and staff identities from student-only booking actions before a data query runs", async () => {
    await expect(callerFor("owner").bookings.mine()).rejects.toThrow("مخصصة لحساب الطالب");
    await expect(callerFor("admin").bookings.create({ propertyId: "b5f9b244-8161-4dc1-9cfe-8ddc0c45e2e1", requestedViewingAt: "2030-01-01T12:00:00.000Z", name: "اختبار", phone: "01000000000", peopleCount: 1, termsAccepted: true })).rejects.toThrow("مخصصة لحساب الطالب");
  });

  it("blocks non-staff identities from the staff booking list and final completion procedure", async () => {
    await expect(callerFor("student").bookings.staffList()).rejects.toThrow("مخصصة للإدارة");
    await expect(callerFor("owner").bookings.updateByStaff({ bookingId: "b5f9b244-8161-4dc1-9cfe-8ddc0c45e2e1", status: "COMPLETED" })).rejects.toThrow("مخصصة للإدارة");
  });

  it("blocks student identities from owner-only property access before a data query runs", async () => {
    await expect(callerFor("student").properties.ownerList()).rejects.toThrow("مخصصة لمالك معتمد");
  });

  it("blocks an administrator from Super Admin-only role management", async () => {
    await expect(callerFor("admin").superAdmin.setRole({ userId: "b5f9b244-8161-4dc1-9cfe-8ddc0c45e2e1", role: "admin" })).rejects.toThrow("مدير عام");
    await expect(callerFor("admin").superAdmin.listUsers()).rejects.toThrow("مدير عام");
    await expect(callerFor("admin").superAdmin.propertyViewStats()).rejects.toThrow("مدير عام");
  });

  it("does not permit a Super Admin to alter their own privileged role", async () => {
    await expect(callerFor("super_admin").superAdmin.setRole({ userId: "b5f9b244-8161-4dc1-9cfe-8ddc0c45e2e1", role: "student" })).rejects.toThrow("cannot change their own role");
  });
});
