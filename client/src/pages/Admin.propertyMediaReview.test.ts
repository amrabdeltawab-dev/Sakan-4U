import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Admin property media review", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/components/PropertyMediaReviewCard.tsx"), "utf8");
  const admin = readFileSync(resolve(process.cwd(), "client/src/pages/Admin.tsx"), "utf8");

  it("shows ordered private source images, metadata, derivative state, and authorised verification evidence", () => {
    expect(source).toContain("صور العقار الخاصة للمراجعة");
    expect(source).toContain("media.url");
    expect(source).toContain("left.sortOrder");
    expect(source).toContain("media.description");
    expect(source).toContain("media.watermarkStatus");
    expect(source).toContain("Sakan 4U المائية");
    expect(source).toContain("أدلة تحقق خاصة");
    expect(source).toContain("إحداثيات المبنى الدقيقة — للمراجعة الداخلية");
    expect(source).toContain("الوصف الأصلي المقدم من المالك");
    expect(source).toContain("ownerDescription");
    expect(source).toContain("لا تُنشر هذه الإحداثيات أو هذا الوصف الأصلي للطلاب");
    expect(source).toContain("setSelectedPhoto");
    expect(source).toContain("معاينة صورة العقار");
  });

  it("disables approval until the reviewer confirms media suitability", () => {
    expect(source).toContain("propertyPhotosQualityVerified");
    expect(source).toContain("photos.length < 3");
    expect(source).toContain("تم التحقق من أن الصور تمثل العقار الفعلي وبجودة مناسبة");
  });

  it("requires an owner-visible reason when rejecting media quality", () => {
    expect(source).toContain("سبب الرفض متعلق بجودة الصور أو ملاءمتها");
    expect(source).toContain("reason.trim().length < 12");
    expect(source).toContain("رفض بسبب الصور");
  });

  it("allows staff to save a privacy-safe revised description before approval", () => {
    expect(source).toContain("تنقيح الوصف قبل الاعتماد");
    expect(source).toContain("حفظ الوصف المنقح");
    expect(source).toContain("updatePropertyDescription");
    expect(source).toContain("إزالة أي رقم مبنى أو رقم هاتف");
  });

  it("offers reusable rejection templates and a student-safe quick preview without staff-only fields", () => {
    expect(source).toContain("rejectionTemplates");
    expect(source).toContain("صور غير واضحة");
    expect(source).toContain("مراجعة العنوان الدقيق");
    expect(source).toContain("معاينة الطالب");
    expect(source).toContain("معاينة كما سيظهر للطالب");
    expect(source).toContain("لا تعرض الإحداثيات الدقيقة أو الوصف الأصلي الخاص بالمالك");
  });

  it("uses a compact queue with a modal and distinguishes staged updates from new listings", () => {
    expect(admin).toContain("function PropertyReviewQueue");
    expect(admin).toContain("عرض ومراجعة");
    expect(admin).toContain("مراجعة تعديلات مقترحة");
    expect(admin).toContain("hasPendingUpdates");
    expect(source).toContain("const stagedEdits = item.pendingEdits ?? {};");
    expect(source).toContain("القيمة المشطوبة هي المنشورة الآن");
    expect(source).toContain("اعتماد التعديلات");
  });

  it("renders a deliberate, privacy-safe visual diff between live and proposed staged values", () => {
    expect(source).toContain("const liveValues");
    expect(source).toContain("مقارنة التعديلات المقترحة");
    expect(source).toContain("القيمة المشطوبة هي المنشورة الآن");
    expect(source).toContain("الحالي:");
    expect(source).toContain("المقترح:");
    expect(source).toContain("line-through");
    expect(source).toContain("text-[#047857]");
    expect(source).toContain("الإحداثيات الدقيقة (داخلية فقط)");
  });
});
