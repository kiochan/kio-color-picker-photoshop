import { clamp, normalizedHue } from "./conversions.js";
import type { HSV } from "./types.js";
export function relation(a: HSV, b: HSV): HSV {
  return { h: normalizedHue(b.h - a.h + 180) - 180, s: b.s - a.s, v: b.v - a.v };
}
export function linkedColor(src: HSV, offset: HSV, sign: 1 | -1): HSV {
  return {
    h: normalizedHue(src.h + sign * offset.h),
    s: clamp(src.s + sign * offset.s, 0, 1),
    v: clamp(src.v + sign * offset.v, 0, 1),
  };
}
