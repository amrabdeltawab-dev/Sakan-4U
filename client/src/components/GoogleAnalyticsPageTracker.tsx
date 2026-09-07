import { useEffect } from "react";
import { useLocation } from "wouter";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * GA4's initial configuration intentionally disables automatic page views in
 * index.html. This sends one accurate event after each Wouter route change.
 */
export function GoogleAnalyticsPageTracker() {
  const [location] = useLocation();

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;
    window.gtag("event", "page_view", {
      page_location: window.location.href,
      page_path: location,
      page_title: document.title,
    });
  }, [location]);

  return null;
}
