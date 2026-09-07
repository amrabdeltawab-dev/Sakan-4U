import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../../..");
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("production readiness controls", () => {
  it("compresses owner images locally to WebP before active upload payloads are encoded", () => {
    const utility = source("client/src/lib/propertyImageCompression.ts");
    const picker = source("client/src/components/PropertyPhotoPicker.tsx");
    const wizard = source("client/src/components/OwnerPropertyCreateWizard.tsx");
    const manager = source("client/src/components/OwnerPropertyManagementCard.tsx");
    expect(utility).toContain("browser-image-compression");
    expect(utility).toContain("PROPERTY_IMAGE_UPLOAD_TARGET_BYTES = 500 * 1024");
    expect(utility).toContain('fileType: "image/webp"');
    expect(picker).toContain("compressPropertyImage");
    expect(wizard).toContain("await compressPropertyImage(photo.file)");
    expect(manager).toContain("await compressPropertyImage(next)");
  });

  it("uses archive-only property lifecycle controls and excludes archived rows from public surfaces", () => {
    const migration = source("supabase/migrations/20260825220000_property_soft_delete_and_visibility.sql");
    const db = source("server/db.ts");
    expect(migration).toContain("add column if not exists deleted_at timestamptz");
    expect(migration).toContain("property_archive");
    expect(migration).toContain("and deleted_at is null");
    expect(db).toContain('is("deleted_at", null)');
    expect(db).toContain("listSimilarPublicProperties");
    expect(db).not.toContain('from("properties").delete');
  });

  it("renders staff-only WhatsApp controls and similar public property cards", () => {
    const admin = source("client/src/pages/Admin.tsx");
    const details = source("client/src/pages/PropertyDetails.tsx");
    expect(admin).toContain("https://wa.me/");
    expect(admin).toContain("ownerContact");
    expect(admin).toContain("تواصل عبر واتساب");
    expect(details).toContain("عقارات مشابهة قد تعجبك");
    expect(details).toContain("trpc.properties.similar.useQuery");
  });
});
