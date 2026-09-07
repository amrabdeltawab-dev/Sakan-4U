import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const card = readFileSync(resolve(process.cwd(), "client/src/components/PropertyCard.tsx"), "utf8");
const details = readFileSync(resolve(process.cwd(), "client/src/pages/PropertyDetails.tsx"), "utf8");
const home = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
const compare = readFileSync(resolve(process.cwd(), "client/src/components/PropertyCompareDialog.tsx"), "utf8");

describe("property metadata and comparison UI", () => {
  it("renders the three requested metadata badges on cards and details", () => {
    expect(card).toContain("distanceToCampus");
    expect(card).toContain("utilitiesIncluded");
    expect(card).toContain("genderPreference");
    expect(details).toContain("distanceToCampus");
    expect(details).toContain("utilitiesIncluded");
    expect(details).toContain("genderPreference");
  });

  it("opens a responsive video walkthrough iframe only when a video URL exists", () => {
    expect(details).toContain("مشاهدة جولة بالفيديو");
    expect(details).toContain("aspect-video");
    expect(details).toContain("videoEmbedUrl");
    expect(details).toContain("allowFullScreen");
  });

  it("highlights the best numeric values and marks only divergent qualitative rows", () => {
    expect(compare).toContain('kind: "numeric"');
    expect(compare).toContain('direction: "min"');
    expect(compare).toContain('Math.min(...validValues)');
    expect(compare).toContain('direction === "max" ? Math.max(...validValues)');
    expect(compare).toContain('new Set(values).size > 1');
    expect(compare).toContain("أفضل قيمة");
    expect(compare).toContain("مختلف");
    expect(compare).toContain("bg-[#f0fdf4]");
  });

  it("keeps comparison bounded to three listings and compares required fields", () => {
    expect(home).toContain("current.length >= 3");
    expect(home).toContain("مقارنة ({compareIds.length})");
    expect(compare).toContain("السعر");
    expect(compare).toContain("المسافة عن الحرم");
    expect(compare).toContain("الغرف");
    expect(compare).toContain("المرافق المشمولة");
  });
});
