import { describe, expect, it } from "vitest";

describe("SuperAdmin user-management UX", () => {
  it("shows a safe Arabic retry state instead of a raw query error", async () => {
    const source = await import("node:fs/promises").then(fs => fs.readFile("client/src/pages/SuperAdmin.tsx", "utf8"));
    expect(source).toContain("تعذر تحميل الحسابات الآن. أعد المحاولة لاحقاً.");
    expect(source).toContain("void profiles.refetch()");
    expect(source).not.toContain("تعذر تحميل الحسابات: {profiles.error.message}");
  });
});
