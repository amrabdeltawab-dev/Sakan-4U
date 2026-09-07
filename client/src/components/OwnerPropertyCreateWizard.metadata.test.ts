import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "client/src/components/OwnerPropertyCreateWizard.tsx"), "utf8");

describe("owner listing metadata form", () => {
  it("includes the requested listing metadata in the submission payload", () => {
    expect(source).toContain("distanceToCampus");
    expect(source).toContain("utilitiesIncluded");
    expect(source).toContain("videoUrl");
    expect(source).toContain("genderPreference");
  });

  it("restricts rent-by-bed choices to male or female", () => {
    expect(source).toContain("إجباري للتأجير بالسرير: اختر شباب أو طالبات فقط.");
    expect(source).toContain("form.rentType === \"full\" && <option value=\"anyone\">مناسب للجميع</option>");
    expect(source).toContain("!validGenderPreference");
  });
});
