import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Cloudflare Wrangler configuration", () => {
  it("points static assets at the Vite public output directory", () => {
    const config = readFileSync(resolve(process.cwd(), "wrangler.toml"), "utf8");

    expect(config).toContain('name = "sakeno-mvp"');
    expect(config).toContain('compatibility_date = "2026-08-26"');
    expect(config).toContain("[assets]");
    expect(config).toContain('directory = "dist/public"');
  });
});
