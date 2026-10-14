export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Hue in degrees; saturation and brightness in the range 0–1. */
export interface HSV {
  h: number;
  s: number;
  v: number;
}

export type Channel = keyof RGB;
export type Swatch = "fg" | "bg";
export type Colors = Record<Swatch, RGB>;
export type ColorWrite = Partial<Colors>;
export const channels: readonly Channel[] = ["r", "g", "b"];
export const swatches: readonly Swatch[] = ["fg", "bg"];
