import type { Channel, HSV, RGB } from "./types.js";
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const normalizedHue = (h: number) => ((h % 360) + 360) % 360;
export function hsvToRgb(h: number, s: number, v: number): RGB {
  h = normalizedHue(h);
  s = clamp(s, 0, 1);
  v = clamp(v, 0, 1);
  const c = v * s,
    x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = v - c;
  const [r, g, b]: [number, number, number] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}
export function rgbToHsv(color: RGB, hueFallback = 0, saturationFallback = 0): HSV {
  const r = color.r / 255,
    g = color.g / 255,
    b = color.b / 255,
    ma = Math.max(r, g, b),
    mi = Math.min(r, g, b),
    d = ma - mi;
  let h = hueFallback;
  if (d > 0.00001) {
    if (ma === r) h = 60 * (((g - b) / d) % 6);
    else if (ma === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: normalizedHue(h), s: ma === 0 ? saturationFallback : d / ma, v: ma };
}
export const toHex = (color: RGB) =>
  "#" +
  [color.r, color.g, color.b]
    .map((c) =>
      Math.round(clamp(c, 0, 255))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase();
export function fromHex(hex: string): RGB | null {
  const m = /^#?([a-f\d]{6})$/i.exec(String(hex).trim());
  if (!m?.[1]) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
export const clone = (x: RGB): RGB => ({ r: x.r, g: x.g, b: x.b });
export const same = (a: RGB | null | undefined, b: RGB | null | undefined): boolean =>
  !!a && !!b && toHex(a) === toHex(b);

export function rgbGradient(rgb: RGB, key: Channel): string {
  const lo = clone(rgb),
    hi = clone(rgb);
  lo[key] = 0;
  hi[key] = 255;
  return `linear-gradient(90deg, ${toHex(lo)} 0%, ${toHex(hi)} 100%)`;
}
