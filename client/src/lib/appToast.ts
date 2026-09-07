import { toast as sonnerToast } from "sonner";
import { toArabicErrorMessage } from "@/lib/errorMessages";

const DUPLICATE_TOAST_WINDOW_MS = 1200;
let lastToast = { message: "", at: 0 };

function toastKey(message: unknown) {
  return typeof message === "string" ? message : JSON.stringify(message);
}

function isDuplicate(message: string) {
  const now = Date.now();
  if (lastToast.message === message && now - lastToast.at < DUPLICATE_TOAST_WINDOW_MS) return true;
  lastToast = { message, at: now };
  return false;
}

export function showAppError(error: unknown, options?: Parameters<typeof sonnerToast.error>[1]) {
  const message = toArabicErrorMessage(error);
  if (isDuplicate(message)) return;
  return sonnerToast.error(message, { ...options, position: "top-center" });
}

export function showActionError(error: unknown, fallback: string, options?: Parameters<typeof sonnerToast.error>[1]) {
  const message = toArabicErrorMessage(error, fallback);
  if (isDuplicate(message)) return;
  return sonnerToast.error(message, { ...options, position: "top-center" });
}

export const toast = {
  success: (message: unknown, options?: Parameters<typeof sonnerToast.success>[1]) => {
    const text = toastKey(message);
    if (isDuplicate(text)) return;
    return sonnerToast.success(text, { ...options, position: "top-center" });
  },
  error: (error: unknown, options?: Parameters<typeof sonnerToast.error>[1]) => showAppError(error, options),
};
