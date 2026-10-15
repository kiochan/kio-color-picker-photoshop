import { clamp } from "../color/conversions.js";
import type { HSV } from "../color/types.js";
import type { PickerRegion, Point } from "./types.js";
export function pickerRegion(pos: Point): PickerRegion | null {
  const a = (pos.x - 0.5) / 0.38,
    b = (pos.y - 0.5) / 0.38;
  if (Math.abs(a) + Math.abs(b) <= 1.015) return "diamond";
  const r = Math.hypot(pos.x - 0.5, pos.y - 0.5);
  if (r >= 0.421 && r <= 0.505) return "ring";
  return null;
}
// Orthogonally project the pointer onto the diamond when a drag leaves it.
// Independent u/v clamping caused a jump near the lower (black) vertex.
export function constrainToDiamond(pos: Point): Point {
  const x = pos.x - 0.5,
    y = pos.y - 0.5,
    d = 0.38;
  if (Math.abs(x) + Math.abs(y) <= d) return pos;
  const corners: [Point, Point, Point, Point] = [
    { x: 0, y: -d },
    { x: d, y: 0 },
    { x: 0, y: d },
    { x: -d, y: 0 },
  ];
  let best: Point = corners[0],
    dist = Infinity;
  const next = [1, 2, 3, 0] as const;
  for (const i of [0, 1, 2, 3] as const) {
    const a = corners[i],
      b = corners[next[i]];
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
    const q = { x: a.x + t * dx, y: a.y + t * dy };
    const delta = (x - q.x) ** 2 + (y - q.y) ** 2;
    if (delta < dist) {
      dist = delta;
      best = q;
    }
  }
  return { x: best.x + 0.5, y: best.y + 0.5 };
}

export function hsvToPoint(hsv: Pick<HSV, "s" | "v">): Point {
  // HSL-shaped diamond: top white, left gray, right pure hue, bottom black.
  // Keep the public state in HSV for Photoshop and linked-color offsets.
  const chroma = hsv.v * hsv.s;
  const lightness = hsv.v - chroma / 2;
  const span = 1 - Math.abs(2 * lightness - 1);
  return { x: 0.5 + (2 * chroma - span) * 0.38, y: 0.5 + (1 - 2 * lightness) * 0.38 };
}
export function pointToSv(pos: Point, saturationFallback = 0): Pick<HSV, "s" | "v"> {
  const p = constrainToDiamond(pos),
    a = (p.x - 0.5) / 0.38,
    b = (p.y - 0.5) / 0.38;
  const lightness = clamp((1 - b) / 2, 0, 1);
  const span = 1 - Math.abs(2 * lightness - 1);
  const chroma = clamp((a + span) / 2, 0, span);
  const v = lightness + chroma / 2;
  return { s: v > 1e-12 ? clamp(chroma / v, 0, 1) : saturationFallback, v };
}
export function layout(width: number, height: number) {
  const dimension = Math.max(1, Math.floor(Math.min(width - 12, height - 84, 480)));
  return {
    dimension,
    railWidth: Math.min(Math.max(1, width - 6), 492, Math.max(220, dimension + 12)),
  };
}
