export interface WatermarkDimensions {
  width: number;
  height: number;
}

export interface WatermarkConfig {
  fontSize: number;
  badgeSize: number;
  padding: number;
}

export function getWatermarkConfig(dimensions: WatermarkDimensions): WatermarkConfig {
  const smallerEdge = Math.max(Math.min(dimensions.width, dimensions.height), 1);
  const fontSize = Math.max(1, Math.round(smallerEdge * 0.055));
  const badgeSize = Math.max(2, Math.round(fontSize * 1.55));
  const padding = Math.round(fontSize * 0.7);
  return { fontSize, badgeSize, padding };
}

export function buildWatermarkSvg(dimensions: WatermarkDimensions): string {
  const { width, height } = dimensions;
  const { fontSize, badgeSize, padding } = getWatermarkConfig(dimensions);
  const mark = (x: number, y: number, opacity: number) => `
    <g transform="translate(${x}, ${y})" opacity="${opacity}">
      <rect x="0" y="0" width="${badgeSize}" height="${badgeSize}" rx="${Math.round(badgeSize * 0.28)}" fill="#f26b38"/>
      <text x="${Math.round(badgeSize / 2)}" y="${Math.round(badgeSize * 0.69)}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${Math.round(fontSize * 0.92)}" font-weight="700" fill="white">S</text>
      <text x="${badgeSize + Math.round(fontSize * 0.34)}" y="${Math.round(badgeSize * 0.67)}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="700" letter-spacing="2" fill="white">Sakan 4U</text>
    </g>`;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    ${mark(padding, padding, 0.62)}
    ${mark(Math.max(padding, width - Math.round(fontSize * 6.8)), Math.max(padding, height - badgeSize - padding), 0.78)}
  </svg>`;
}
