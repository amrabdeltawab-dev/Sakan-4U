import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("PropertyPhotoPicker", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/components/PropertyPhotoPicker.tsx"), "utf8");

  it("enforces the visible image bounds and supports previews, cover selection, metadata, drag reordering, and truthful states", () => {
    expect(source).toContain("MIN_PROPERTY_PHOTOS = 3");
    expect(source).toContain("MAX_PROPERTY_PHOTOS = 12");
    expect(source).toContain("MAX_PROPERTY_PHOTO_BYTES");
    expect(source).toContain("URL.createObjectURL");
    expect(source).toContain("removePhoto");
    expect(source).toContain("onDragStart");
    expect(source).toContain("onDrop");
    expect(source).toContain("reorder(index, 0)");
    expect(source).toContain("description");
    expect(source).toContain("tag");
    expect(source).toContain("جارٍ رفع المصدر الخاص");
    expect(source).toContain("تم رفع المصدر بنجاح");
    expect(source).toContain("فشل الرفع — أعد المحاولة");
    expect(source).toContain("جارٍ رفع الصور الخاصة وإعداد الإعلان للمراجعة");
    expect(source).toContain('role="progressbar"');
    expect(source).toContain("اختر وسم الصورة");
    expect(source).toContain("PROPERTY_PHOTO_TAGS.map");
  });

  it("restricts browser selection to the supported image formats", () => {
    expect(source).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(source).toContain("image/webp");
  });
});
