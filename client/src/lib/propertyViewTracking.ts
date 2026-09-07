export const PROPERTY_VIEW_SESSION_STORAGE_KEY = "sakeno.property-view-session-id";

type SessionStorageLike = Pick<Storage, "getItem" | "setItem">;

export function ensurePropertyViewSessionId(storage: SessionStorageLike, createId: () => string) {
  const existing = storage.getItem(PROPERTY_VIEW_SESSION_STORAGE_KEY);
  if (existing) return existing;
  const created = createId();
  storage.setItem(PROPERTY_VIEW_SESSION_STORAGE_KEY, created);
  return created;
}

export function getPropertyViewSessionId() {
  if (typeof window === "undefined" || !window.crypto?.randomUUID) return null;
  try {
    return ensurePropertyViewSessionId(window.sessionStorage, () => window.crypto.randomUUID());
  } catch {
    return null;
  }
}
