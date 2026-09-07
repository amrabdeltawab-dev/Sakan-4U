import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Reserved property public UI", () => {
  const card = readFileSync(resolve(process.cwd(), "client/src/components/PropertyCard.tsx"), "utf8");
  const details = readFileSync(resolve(process.cwd(), "client/src/pages/PropertyDetails.tsx"), "utf8");
  const requestPanel = readFileSync(resolve(process.cwd(), "client/src/components/BookingRequestPanel.tsx"), "utf8");

  it("shows the Arabic reservation state and prevents a new viewing request", () => {
    expect(card).toContain('property.availabilityStatus === "RESERVED"');
    expect(details).toContain("محجوزة لمعاينة قادمة");
    expect(requestPanel).toContain('property.availabilityStatus === "RESERVED"');
    expect(requestPanel).toContain("<Button disabled");
  });
});
