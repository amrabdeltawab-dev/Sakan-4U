import { describe, expect, it } from "vitest";
import { publicNavigationItems } from "./publicNavigation";

describe("public mobile navigation", () => {
  it("links only to existing public discovery, information, and owner-onboarding routes", () => {
    expect(publicNavigationItems).toEqual([
      { label: "الرئيسية", href: "/" },
      { label: "اكتشف السكن", href: "/#listings" },
      { label: "كيف يعمل Sakan 4U", href: "/#how" },
      { label: "انضم كمالك", href: "/signup/owner" },
    ]);
  });
});
