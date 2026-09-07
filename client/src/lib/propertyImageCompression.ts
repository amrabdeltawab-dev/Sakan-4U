import imageCompression from "browser-image-compression";

export const PROPERTY_IMAGE_UPLOAD_TARGET_BYTES = 500 * 1024;
const COMPRESSION_TARGET_MB = 0.48;
const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function webpName(name: string) {
  const base = name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "-") || "property-image";
  return `${base}.webp`;
}

/** Compresses the private source in the browser before it enters any upload payload. */
export async function compressPropertyImage(file: File): Promise<File> {
  if (!supportedTypes.has(file.type)) throw new Error("تدعم Sakan 4U صور JPEG وPNG وWebP فقط.");
  if (!file.size) throw new Error("ملف الصورة المحدد فارغ أو غير صالح.");
  const compressed = await imageCompression(file, {
    maxSizeMB: COMPRESSION_TARGET_MB,
    maxWidthOrHeight: 2200,
    useWebWorker: true,
    fileType: "image/webp",
    initialQuality: 0.82,
    preserveExif: false,
  });
  if (compressed.size > PROPERTY_IMAGE_UPLOAD_TARGET_BYTES) throw new Error("تعذر ضغط الصورة إلى الحجم المناسب. اختر صورة أصغر أو أوضح.");
  return new File([compressed], webpName(file.name), { type: "image/webp", lastModified: Date.now() });
}
