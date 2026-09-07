type SharpModule = typeof import("sharp");
let sharpModulePromise: Promise<SharpModule> | undefined;

async function getSharpModule(): Promise<SharpModule> {
  sharpModulePromise ??= import("sharp");
  return sharpModulePromise;
}

export async function assertProcessablePropertyImage(source: Buffer) {
  const sharp = (await getSharpModule()).default;
  const metadata = await sharp(source, { failOn: "error" }).metadata();
  if (!metadata.width || !metadata.height) throw new Error("تعذر قراءة أبعاد الصورة.");
  return metadata;
}

/**
 * Creates a separate public WebP derivative. The input buffer is never modified
 * or written back to the source bucket, so retries always begin with the original.
 */
export async function createSakenoWatermarkedDerivative(source: Buffer) {
  const sharp = (await getSharpModule()).default;
  const image = sharp(source, { failOn: "error" }).rotate();
  const metadata = await assertProcessablePropertyImage(source);
  const width = metadata.width ?? 1200;
  const height = metadata.height ?? 900;
  const smallerEdge = Math.max(Math.min(width, height), 1);
  const fontSize = Math.max(1, Math.round(smallerEdge * 0.038));
  const badgeSize = Math.max(2, Math.round(fontSize * 1.55));
  const mark = (x: number, y: number, opacity: number) => `
    <g transform="translate(${x}, ${y})" opacity="${opacity}">
      <rect x="0" y="0" width="${badgeSize}" height="${badgeSize}" rx="${Math.round(badgeSize * 0.28)}" fill="#f26b38"/>
      <text x="${Math.round(badgeSize / 2)}" y="${Math.round(badgeSize * 0.69)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${Math.round(fontSize * 0.92)}" font-weight="700" fill="white">S</text>
      <text x="${badgeSize + Math.round(fontSize * 0.34)}" y="${Math.round(badgeSize * 0.67)}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="700" letter-spacing="2" fill="white">Sakan 4U</text>
    </g>`;
  const padding = Math.round(fontSize * 0.7);
  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    ${mark(padding, padding, 0.62)}
    ${mark(Math.max(padding, width - Math.round(fontSize * 6.8)), Math.max(padding, height - badgeSize - padding), 0.78)}
  </svg>`;

  return image
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .webp({ quality: 86, effort: 4 })
    .toBuffer();
}
