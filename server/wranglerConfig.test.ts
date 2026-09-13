import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Cloudflare Wrangler configuration", () => {
  const config = readFileSync(resolve(process.cwd(), "wrangler.toml"), "utf8");

  it("points static assets at the Vite public output directory", () => {
    expect(config).toContain('compatibility_date = "2026-08-26"');
    expect(config).toContain("[assets]");
    expect(config).toContain('directory = "dist/public"');
  });

  it("does not commit secrets as plaintext vars", () => {
    expect(config).not.toMatch(/RESEND_API_KEY\s*=\s*["']re_/);
    expect(config).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*["']/);
    expect(config).not.toMatch(/WATERMARK_SERVICE_SECRET\s*=\s*["']/);
  });
});
