import { beforeEach, describe, expect, it, vi } from "vitest";

const error = vi.fn();
const success = vi.fn();
vi.mock("sonner", () => ({ toast: { error, success } }));

const { showActionError, showAppError, toast } = await import("./appToast");

describe("global Arabic error toast integration", () => {
  beforeEach(() => { error.mockClear(); success.mockClear(); });

  it("translates a technical validation failure and displays it at the top center", () => {
    showAppError({ message: '[{"code":"too_small","path":["property","bathrooms"]}]' });
    expect(error).toHaveBeenCalledWith("يرجى إدخال عدد الحمامات بشكل صحيح. يجب أن يكون حماماً واحداً على الأقل.", { position: "top-center" });
  });

  it("uses an action-specific Arabic fallback when a booking mutation fails technically", () => {
    showActionError(new Error("TRPCError: database unavailable"), "تعذر إرسال طلب المعاينة الآن. راجع البيانات وحاول مرة أخرى.");
    expect(error).toHaveBeenCalledWith("تعذر إرسال طلب المعاينة الآن. راجع البيانات وحاول مرة أخرى.", { position: "top-center" });
  });

  it("suppresses duplicate identical error and success messages", () => {
    showAppError(new Error("validation duplicate"));
    showAppError(new Error("validation duplicate"));
    toast.success("تم الحفظ");
    toast.success("تم الحفظ");
    expect(error).toHaveBeenCalledTimes(1);
    expect(success).toHaveBeenCalledTimes(1);
  });

  it("installs a shared top-center notifier for React Query errors and direct error toasts", async () => {
    const main = await import("node:fs/promises").then(fs => fs.readFile("client/src/main.tsx", "utf8"));
    const notifier = await import("node:fs/promises").then(fs => fs.readFile("client/src/lib/appToast.ts", "utf8"));
    const app = await import("node:fs/promises").then(fs => fs.readFile("client/src/App.tsx", "utf8"));
    expect(main).toContain("new QueryCache({ onError: error => showAppError(error) })");
    expect(main).toContain("new MutationCache({ onError: error => showAppError(error) })");
    expect(notifier).toContain('position: "top-center"');
    expect(notifier).toContain("toArabicErrorMessage");
    expect(notifier).toContain('position: "top-center"');
    expect(app).toContain('<Toaster richColors position="top-center" />');
  });
});
