// Canvas watermarking runs in the admin browser at approval time.
// jsdom does not implement canvas.toBlob or createImageBitmap, so these
// functions cannot be unit-tested in the vitest/jsdom environment.
import { buildWatermarkSvg } from "@shared/watermark";

const WEBP_QUALITY = 0.86;

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function loadImageFromBytes(bytes: Uint8Array): Promise<ImageBitmap> {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/octet-stream" });
  return createImageBitmap(blob, { imageOrientation: "from-image" });
}

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function loadSvgImage(svg: string, width: number, height: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("تعذر تحميل طبقة العلامة المائية."));
    img.width = width;
    img.height = height;
    img.src = svgToDataUrl(svg);
  });
}

async function canvasToWebpBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error("تعذر تصدير الصورة بصيغة WebP."))),
      "image/webp",
      WEBP_QUALITY,
    );
  });
}

export async function generateWatermarkedWebp(sourceBytes: Uint8Array): Promise<string> {
  const bitmap = await loadImageFromBytes(sourceBytes);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("تعذر تهيئة لوحة الرسم للعلامة المائية.");
  ctx.drawImage(bitmap, 0, 0);

  const svg = buildWatermarkSvg({ width: bitmap.width, height: bitmap.height });
  const overlay = await loadSvgImage(svg, bitmap.width, bitmap.height);
  ctx.drawImage(overlay, 0, 0);

  const blob = await canvasToWebpBlob(canvas);
  const arrayBuffer = await blob.arrayBuffer();
  return uint8ArrayToBase64(new Uint8Array(arrayBuffer));
}

export async function generateWatermarkedWebpFromBase64(sourceBase64: string): Promise<string> {
  return generateWatermarkedWebp(base64ToUint8Array(sourceBase64));
}

export function isWebpSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 12
    && bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50;
}

export { base64ToUint8Array, uint8ArrayToBase64 };
