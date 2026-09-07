import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Mandatory owner verification and booking terms", () => {
  const wizard = readFileSync(resolve(process.cwd(), "client/src/components/OwnerPropertyCreateWizard.tsx"), "utf8");
  const bookingPanel = readFileSync(resolve(process.cwd(), "client/src/components/BookingRequestPanel.tsx"), "utf8");
  const db = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");
  const router = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
  const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260826071500_mandatory_owner_id_and_booking_terms.sql"), "utf8");
  const reviewCard = readFileSync(resolve(process.cwd(), "client/src/components/PropertyMediaReviewCard.tsx"), "utf8");

  it("requires a private National ID before owner property submission while retaining optional evidence", () => {
    expect(wizard).toContain("صورة البطاقة الشخصية (إجباري)");
    expect(wizard).toContain("فاتورة مرافق أو عقد ملكية (اختياري)");
    expect(wizard).toContain("الاسم المسجل في حسابك يطابق الاسم الظاهر في البطاقة");
    expect(wizard).toContain("nationalIdDocument");
    expect(wizard).toContain('kind: "national_id"');
    expect(wizard).toContain('encodeDocument(ownershipEvidence, "ownership_evidence")');
    expect(wizard).toContain('accept="application/pdf,image/jpeg,image/png"');
    expect(router).toContain("nationalIdDocument: propertyVerificationDocumentInput");
    expect(db).toContain('nationalIdDocument.kind !== "national_id"');
    expect(db).toContain("submittedNationalIdDocument: true");
  });

  it("keeps classified identity documents in private storage and exposes them only to staff review", () => {
    expect(db).toContain('const bucket = isVerification ? "verification_documents" : "property-media-staging"');
    expect(db).toContain("verification_document_kind");
    expect(db).toContain("withManagedMediaUrls(data ?? [], false)");
    expect(migration).toContain('verification_document_kind in (\'national_id\', \'ownership_evidence\')');
    expect(migration).toContain('create policy "staff read owner verification documents"');
    expect(migration).toContain("private.is_staff()");
    expect(migration).toContain("يلزم رفع صورة البطاقة الشخصية");
    expect(reviewCard).toContain("Admin أو Super Admin فقط");
    expect(reviewCard).toContain("media.url");
  });

  it("requires the exact Arabic viewing terms acknowledgement in both client and server contracts", () => {
    const terms = "أوافق على شروط المعاينة، وقواعد التنسيق، وأقر بأن منصة Sakan 4U هي جهة تنسيق ووساطة إعلانية وليست طرفاً في عقد الإيجار النهائي.";
    expect(bookingPanel).toContain(terms);
    expect(bookingPanel).toContain("termsAccepted");
    expect(bookingPanel).toContain("disabled={!maySubmit}");
    expect(router).toContain("termsAccepted: z.boolean().refine");
    expect(db).toContain("target_terms_accepted: input.termsAccepted");
    expect(migration).toContain("target_terms_accepted boolean");
    expect(migration).toContain("viewing_terms_accepted_at");
  });
});
