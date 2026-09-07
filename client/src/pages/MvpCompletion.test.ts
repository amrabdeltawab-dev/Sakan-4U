import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("MVP completion interfaces", () => {
  const admin = readFileSync(resolve(process.cwd(), "client/src/pages/Admin.tsx"), "utf8");
  const settings = readFileSync(resolve(process.cwd(), "client/src/pages/Settings.tsx"), "utf8");
  const home = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const favorites = readFileSync(resolve(process.cwd(), "client/src/pages/Favorites.tsx"), "utf8");
  const account = readFileSync(resolve(process.cwd(), "client/src/pages/Account.tsx"), "utf8");
  const notFound = readFileSync(resolve(process.cwd(), "client/src/pages/NotFound.tsx"), "utf8");
  const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
  const shell = readFileSync(resolve(process.cwd(), "client/src/components/WorkspaceShell.tsx"), "utf8");

  it("renders live staff-only platform statistics with a bounded refresh interval", () => {
    expect(admin).toContain("trpc.admin.stats.useQuery");
    expect(admin).toContain("refetchInterval: 30_000");
    expect(admin).toContain("إجمالي الطلاب");
    expect(admin).toContain("إجمالي الملاك");
    expect(admin).toContain("عقارات قيد المراجعة");
    expect(admin).toContain("عقارات معتمدة");
  });

  it("exposes authenticated settings through the protected profile contract and Supabase Auth password update", () => {
    expect(settings).toContain("trpc.profile.me.useQuery");
    expect(settings).toContain("trpc.profile.update.useMutation");
    expect(settings).toContain("supabase.auth.updateUser({ password })");
    expect(settings).toContain("إعدادات الملف الشخصي");
    expect(app).toContain('path="/settings"');
    expect(shell).toContain('href: "/settings"');
  });

  it("uses the shared Arabic empty-state treatment for favorites, search results, bookings, and review queues", () => {
    expect(favorites).toContain("لا توجد عقارات مفضلة");
    expect(home).toContain("عفواً، لا توجد أماكن تطابق بحثك حالياً");
    expect(account).toContain("لا توجد طلبات معاينة بعد");
    expect(admin).toContain("طابور مراجعة العقارات فارغ");
    expect(admin).toContain("لا توجد طلبات اعتماد معلقة");
  });

  it("replaces the generic fallback with an RTL Sakan 4U 404 screen", () => {
    expect(notFound).toContain('dir="rtl"');
    expect(notFound).toContain("<Brand light />");
    expect(notFound).toContain("لم نعثر على هذه الصفحة");
    expect(notFound).toContain("العودة للصفحة الرئيسية");
  });
});
