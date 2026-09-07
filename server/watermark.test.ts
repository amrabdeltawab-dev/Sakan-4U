import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { assertProcessablePropertyImage, createSakenoWatermarkedDerivative } from "./watermark";

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

  it("rejects an image-shaped byte sequence that cannot actually be decoded", async () => {
    await expect(assertProcessablePropertyImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).rejects.toThrow();
  });
});
