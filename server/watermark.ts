import { buildWatermarkSvg, getWatermarkConfig } from "@shared/watermark";

export type ImageDimensions = { width: number; height: number };

function readUInt16BE(source: Buffer, offset: number): number {
  return (source[offset] << 8) | source[offset + 1];
}

function readUInt32BE(source: Buffer, offset: number): number {
  return ((source[offset] << 24) | (source[offset + 1] << 16) | (source[offset + 2] << 8) | source[offset + 3]) >>> 0;
}

function parseJpegDimensions(source: Buffer): ImageDimensions {
  let offset = 2;
  while (offset < source.length - 1) {
    if (source[offset] !== 0xff) throw new Error("تعذر قراءة أبعاد الصورة.");
    const marker = source[offset + 1];
    if (marker === 0xff) { offset += 1; continue; }
    if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
    if (marker >= 0xd0 && marker <= 0xd7) { offset += 2; continue; }
    const segmentLength = readUInt16BE(source, offset + 2);
    const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSOF) {
      if (offset + 9 > source.length) throw new Error("تعذر قراءة أبعاد الصورة.");
      const height = readUInt16BE(source, offset + 5);
      const width = readUInt16BE(source, offset + 7);
      if (!width || !height) throw new Error("تعذر قراءة أبعاد الصورة.");
      return { width, height };
    }
    offset += 2 + segmentLength;
  }
  throw new Error("تعذر قراءة أبعاد الصورة.");
}

function parsePngDimensions(source: Buffer): ImageDimensions {
  if (source.length < 24) throw new Error("تعذر قراءة أبعاد الصورة.");
  if (readUInt32BE(source, 12) !== 0x49484452) throw new Error("تعذر قراءة أبعاد الصورة.");
  const width = readUInt32BE(source, 16);
  const height = readUInt32BE(source, 20);
  if (!width || !height) throw new Error("تعذر قراءة أبعاد الصورة.");
  return { width, height };
}

function parseWebpDimensions(source: Buffer): ImageDimensions {
  if (source.length < 30) throw new Error("تعذر قراءة أبعاد الصورة.");
  const chunkType = source.subarray(12, 16).toString("ascii");
  if (chunkType === "VP8 ") {
    const width = (source[26] | (source[27] << 8)) & 0x3fff;
    const height = (source[28] | (source[29] << 8)) & 0x3fff;
    if (!width || !height) throw new Error("تعذر قراءة أبعاد الصورة.");
    return { width, height };
  }
  if (chunkType === "VP8L") {
    if (source.length < 25) throw new Error("تعذر قراءة أبعاد الصورة.");
    const bits = source[21] | (source[22] << 8) | (source[23] << 16) | (source[24] << 24);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >>> 14) & 0x3fff) + 1;
    if (!width || !height) throw new Error("تعذر قراءة أبعاد الصورة.");
    return { width, height };
  }
  if (chunkType === "VP8X") {
    if (source.length < 30) throw new Error("تعذر قراءة أبعاد الصورة.");
    const width = ((source[24] | (source[25] << 8) | (source[26] << 16)) + 1) >>> 0;
    const height = ((source[27] | (source[28] << 8) | (source[29] << 16)) + 1) >>> 0;
    if (!width || !height) throw new Error("تعذر قراءة أبعاد الصورة.");
    return { width, height };
  }
  throw new Error("تعذر قراءة أبعاد الصورة.");
}

export function assertProcessablePropertyImage(source: Buffer): ImageDimensions {
  if (source.length < 12) throw new Error("تعذر قراءة أبعاد الصورة.");
  if (source[0] === 0xff && source[1] === 0xd8) return parseJpegDimensions(source);
  if (source.length >= 8 && source.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return parsePngDimensions(source);
  if (source.length >= 12 && source.subarray(0, 4).toString("ascii") === "RIFF" && source.subarray(8, 12).toString("ascii") === "WEBP") return parseWebpDimensions(source);
  throw new Error("تعذر قراءة أبعاد الصورة.");
}

/**
 * Creates a separate public WebP derivative. The input buffer is never modified
 * or written back to the source bucket, so retries always begin with the original.
 */
export async function createSakenoWatermarkedDerivative(source: Buffer) {
  const sharp = (await import("sharp")).default;
  const image = sharp(source, { failOn: "error" }).rotate();
  const { width, height } = assertProcessablePropertyImage(source);
  const svg = buildWatermarkSvg({ width, height });

  return image
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .webp({ quality: 86, effort: 4 })
    .toBuffer();
}
