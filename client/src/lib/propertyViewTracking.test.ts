import { describe, expect, it } from "vitest";
import { PROPERTY_VIEW_SESSION_STORAGE_KEY, ensurePropertyViewSessionId } from "./propertyViewTracking";

describe("property view session tracking", () => {
  it("creates one opaque browser-session identifier and reuses it after refreshes", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
    let generated = 0;

    const first = ensurePropertyViewSessionId(storage, () => `00000000-0000-4000-8000-00000000000${++generated}`);
    const refreshed = ensurePropertyViewSessionId(storage, () => `00000000-0000-4000-8000-00000000000${++generated}`);

    expect(first).toBe("00000000-0000-4000-8000-000000000001");
    expect(refreshed).toBe(first);
    expect(generated).toBe(1);
    expect(values.get(PROPERTY_VIEW_SESSION_STORAGE_KEY)).toBe(first);
  });
});
