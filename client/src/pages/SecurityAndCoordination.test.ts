import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("password verification, property favorites, and request coordination", () => {
  const settings = readFileSync(resolve(process.cwd(), "client/src/pages/Settings.tsx"), "utf8");
  const details = readFileSync(resolve(process.cwd(), "client/src/pages/PropertyDetails.tsx"), "utf8");
  const admin = readFileSync(resolve(process.cwd(), "client/src/pages/Admin.tsx"), "utf8");

  it("verifies the current password with Supabase before applying a new password", () => {
    expect(settings).toContain("كلمة المرور الحالية");
    expect(settings).toContain("supabase.auth.signInWithPassword");
    expect(settings).toContain("password: currentPassword");
    expect(settings).toContain("كلمة المرور الحالية غير صحيحة.");
    expect(settings).toContain("supabase.auth.updateUser({ password })");
    expect(settings).toContain("setCurrentPassword(\"\")");
  });

  it("provides the same student-only favorite mutation on property details alongside sharing", () => {
    expect(details).toContain("trpc.favorites.ids.useQuery");
    expect(details).toContain("trpc.favorites.set.useMutation");
    expect(details).toContain("حفظ في المفضلة");
    expect(details).toContain("إزالة من المفضلة");
    expect(details).toContain("مشاركة");
    expect(details).toContain("returnTo=${encodeURIComponent(`/property/${id}`)}");
  });

  it("keeps the coordination list compact and moves operational controls into an RTL dialog", () => {
    expect(admin).toContain("إدارة الطلب");
    expect(admin).toContain("<Dialog open={open}");
    expect(admin).toContain("<DialogContent dir=\"rtl\"");
    expect(admin).toContain("item.studentContact?.name");
    expect(admin).toContain("<StaffAppointmentExceptionPanel");
    expect(admin).toContain("تسجيل سداد يدوي موثق");
    expect(admin).toContain("تنسيق المعاينة");
  });
});
