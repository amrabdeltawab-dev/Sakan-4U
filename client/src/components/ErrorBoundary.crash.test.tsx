// @vitest-environment jsdom
import React from "react";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ErrorBoundary from "./ErrorBoundary";

function ControlledCrash() {
  throw new Error("controlled boundary crash");
  return null;
}

describe("ErrorBoundary runtime recovery", () => {
  afterEach(() => vi.restoreAllMocks());

  it("catches a child runtime crash and keeps an Arabic fallback mounted", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { getByRole } = render(<ErrorBoundary><ControlledCrash /></ErrorBoundary>);
    expect(getByRole("heading", { name: "عذراً، حدث خطأ غير متوقع" })).toBeTruthy();
    expect(getByRole("button", { name: "إعادة تحميل الصفحة" })).toBeTruthy();
  });
});
