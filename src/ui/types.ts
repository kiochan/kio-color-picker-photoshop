import type { Channel } from "../color/types.js";

export interface Point {
  x: number;
  y: number;
}
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}
export type PickerRegion = "ring" | "diamond";
export type Drag =
  | { type: PickerRegion; rect: Rect }
  | { type: "slider"; key: Channel; rect: Rect };
export interface PointerInput {
  button: number;
  buttons?: number;
  clientX: number;
  clientY: number;
  preventDefault(): void;
}
export interface KeyInput {
  key: string;
  preventDefault(): void;
}
