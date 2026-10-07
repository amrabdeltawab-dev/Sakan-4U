import type { CSSProperties } from 'react';

/**
 * Sakan 4U logo — thin wrapper around the SVG files in /public/brand.
 * Files are used exactly as designed; nothing is redrawn in code.
 *
 *   <SakanLogo />                                  // header, dark background
 *   <SakanLogo theme="light" />                    // light background
 *   <SakanLogo tagline />                          // with "سكنك الجامعي .. بسهولة وأمان"
 *   <SakanLogo variant="stacked" height={120} />   // vertical, mobile / hero
 *   <SakanLogo variant="mark" height={40} />       // icon only (S4U)
 */

type Variant = 'horizontal' | 'stacked' | 'mark';
type Theme = 'dark' | 'light' | 'mono';

export type SakanLogoProps = {
  variant?: Variant;
  /** dark = white logo for dark backgrounds · light = navy logo for light backgrounds · mono = all-white (photos) */
  theme?: Theme;
  tagline?: boolean;
  /** rendered height in px (width follows the aspect ratio) */
  height?: number;
  className?: string;
  style?: CSSProperties;
  alt?: string;
};

const FILES: Record<string, { src: string; w: number; h: number }> = {
  'horizontal-dark':   { src: '/brand/sakan4u-logo.svg',                    w: 1071, h: 360 },
  'horizontal-light':  { src: '/brand/sakan4u-logo-light.svg',              w: 1071, h: 360 },
  'horizontal-mono':   { src: '/brand/sakan4u-logo-white.svg',              w: 1071, h: 360 },
  'horizontal-tagline-dark':  { src: '/brand/sakan4u-logo-tagline.svg',     w: 1071, h: 456 },
  'horizontal-tagline-light': { src: '/brand/sakan4u-logo-tagline-light.svg', w: 1071, h: 456 },
  'stacked-dark':  { src: '/brand/sakan4u-logo-stacked.svg',                w: 871, h: 602 },
  'stacked-light': { src: '/brand/sakan4u-logo-stacked-light.svg',          w: 871, h: 602 },
  'stacked-tagline-dark':  { src: '/brand/sakan4u-logo-stacked-tagline.svg',       w: 871, h: 698 },
  'stacked-tagline-light': { src: '/brand/sakan4u-logo-stacked-tagline-light.svg', w: 871, h: 698 },
  'mark-dark':  { src: '/brand/sakan4u-mark.svg',       w: 1133, h: 1388 },
  'mark-light': { src: '/brand/sakan4u-mark-light.svg', w: 1133, h: 1388 },
  'mark-mono':  { src: '/brand/sakan4u-mark-white.svg', w: 1133, h: 1388 },
};

export default function SakanLogo({
  variant = 'horizontal',
  theme = 'dark',
  tagline = false,
  height = 44,
  className,
  style,
  alt = 'Sakan 4U',
}: SakanLogoProps) {
  const key = `${variant}${tagline ? '-tagline' : ''}-${theme}`;
  const file = FILES[key] ?? FILES[`${variant}-dark`];
  if (!file) return null;

  const width = Math.round((file.w / file.h) * height);

  return (
    <img
      src={file.src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      style={{ width, height, display: 'block', ...style }}
    />
  );
}
