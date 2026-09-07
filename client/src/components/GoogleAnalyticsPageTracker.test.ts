import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("global GA4 tracking", () => {
  const html = readFileSync(resolve(process.cwd(), "client/index.html"), "utf8");
  const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
  const tracker = readFileSync(resolve(process.cwd(), "client/src/components/GoogleAnalyticsPageTracker.tsx"), "utf8");

  it("loads the supplied Measurement ID asynchronously without automatic duplicate page views", () => {
    expect(html).toContain('async src="https://www.googletagmanager.com/gtag/js?id=G-2D4XFJR0HB"');
    expect(html).toContain("gtag('config', 'G-2D4XFJR0HB', { send_page_view: false });");
    expect(html).toContain('rel="preconnect" href="https://www.googletagmanager.com"');
  });

  it("tracks the initial page and each client-side route change through the queued GA4 function", () => {
    expect(app).toContain("<GoogleAnalyticsPageTracker />");
    expect(tracker).toContain("useLocation");
    expect(tracker).toContain('window.gtag("event", "page_view"');
    expect(tracker).toContain("page_location: window.location.href");
    expect(tracker).toContain("page_path: location");
    expect(tracker).toContain("[location]");
  });
});
