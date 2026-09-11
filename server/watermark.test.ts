import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { assertProcessablePropertyImage, createSakenoWatermarkedDerivative } from "./watermark";

describe("assertProcessablePropertyImage", () => {
  it("reads dimensions from a valid JPEG", async () => {
    const source = await sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 100, g: 150, b: 200 } } }).jpeg().toBuffer();
    const dims = assertProcessablePropertyImage(source);
    expect(dims.width).toBe(640);
    expect(dims.height).toBe(480);
  });

  it("reads dimensions from a valid PNG", async () => {
    const source = await sharp({ create: { width: 320, height: 240, channels: 4, background: { r: 50, g: 80, b: 120, alpha: 0.8 } } }).png().toBuffer();
    const dims = assertProcessablePropertyImage(source);
    expect(dims.width).toBe(320);
    expect(dims.height).toBe(240);
  });

  it("reads dimensions from a valid lossy WebP (VP8)", async () => {
    const source = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 200, g: 100, b: 50 } } }).webp({ quality: 80 }).toBuffer();
    const dims = assertProcessablePropertyImage(source);
    expect(dims.width).toBe(400);
    expect(dims.height).toBe(300);
  });

  it("reads dimensions from a valid lossless WebP (VP8L)", async () => {
    const source = await sharp({ create: { width: 256, height: 192, channels: 3, background: { r: 10, g: 20, b: 30 } } }).webp({ lossless: true }).toBuffer();
    const dims = assertProcessablePropertyImage(source);
    expect(dims.width).toBe(256);
    expect(dims.height).toBe(192);
  });

  it("reads dimensions from an extended WebP (VP8X)", async () => {
    const source = await sharp({ create: { width: 512, height: 384, channels: 4, background: { r: 0, g: 128, b: 255, alpha: 0.5 } } }).webp({ quality: 90 }).toBuffer();
    const dims = assertProcessablePropertyImage(source);
    expect(dims.width).toBeGreaterThanOrEqual(510);
    expect(dims.height).toBeGreaterThanOrEqual(380);
  });

  it("throws for a PNG signature without IHDR data (malformed)", () => {
    const truncated = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(() => assertProcessablePropertyImage(truncated)).toThrow();
  });

  it("throws for truncated JPEG (only SOI marker)", () => {
    const truncated = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    expect(() => assertProcessablePropertyImage(truncated)).toThrow();
  });

  it("throws for truncated WebP (only RIFF/WEBP header)", () => {
    const truncated = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
    expect(() => assertProcessablePropertyImage(truncated)).toThrow();
  });

  it("throws for unsupported image format (GIF)", () => {
    const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00]);
    expect(() => assertProcessablePropertyImage(gif)).toThrow();
  });

  it("throws for random non-image bytes", () => {
    expect(() => assertProcessablePropertyImage(Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b]))).toThrow();
  });

  it("throws for empty buffer", () => {
    expect(() => assertProcessablePropertyImage(Buffer.alloc(0))).toThrow();
  });

  it("throws for JPEG with no SOF segment", () => {
    const fakeJpeg = Buffer.from([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x02,
      0xff, 0xd9,
    ]);
    expect(() => assertProcessablePropertyImage(fakeJpeg)).toThrow();
  });
});

describe("createSakenoWatermarkedDerivative", () => {
  it("creates a separate WebP derivative with a visible SAKENO overlay without mutating the source bytes", async () => {
    const source = await sharp({ create: { width: 480, height: 320, channels: 3, background: { r: 18, g: 42, b: 67 } } }).png().toBuffer();
    const derivative = await createSakenoWatermarkedDerivative(source);
    const metadata = await sharp(derivative).metadata();
    expect(metadata.format).toBe("webp");
    expect(derivative.equals(source)).toBe(false);
    expect((await sharp(source).metadata()).format).toBe("png");
    const topLeft = await sharp(derivative).extract({ left: 16, top: 16, width: 20, height: 20 }).raw().toBuffer();
    expect(new Set(topLeft).size).toBeGreaterThan(4);
  });

  it("rejects an image-shaped byte sequence that cannot actually be decoded", () => {
    expect(() => assertProcessablePropertyImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toThrow();
  });
});
