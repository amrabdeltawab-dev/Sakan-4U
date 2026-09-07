import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("browser map configuration", () => {
  it("uses the browser-safe Maps proxy configuration and never references private credentials", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/components/Map.tsx"), "utf8");
    expect(source).toContain("VITE_FRONTEND_FORGE_API_KEY");
    expect(source).toContain("VITE_FRONTEND_FORGE_API_URL");
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(source).not.toContain("BUILT_IN_FORGE_API_KEY");
  });

  it("renders an explicit unavailable state with a safe retry action when the provider script fails", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/components/Map.tsx"), "utf8");
    expect(source).toContain('setMapState("unavailable")');
    expect(source).toContain("إعادة المحاولة");
    expect(source).toContain("publicMapFallbackCopy.unavailableDescription");
  });
});
