import { entrypoints } from "uxp";
import type { Channel } from "../color/types.js";
import type { Rect } from "./types.js";

type ChannelElementKey = `${"slider" | "value" | "marker" | "track"}-${Channel}`;
export type ChannelElements = Record<ChannelElementKey, HTMLElement>;
export type UIElements = ChannelElements &
  Record<
    | "picker"
    | "stage"
    | "foreground"
    | "background"
    | "link"
    | "app"
    | "workArea"
    | "sliderArea"
    | "hexBox"
    | "hexClose"
    | "diamondHue"
    | "hueCursor"
    | "svCursor"
    | "h"
    | "s"
    | "v"
    | "status",
    HTMLElement
  > & { hex: HTMLInputElement; statusFailed?: boolean };

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI element: ${id}`);
  return element as T;
}
export function requiredElement(selector: string): HTMLElement {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element as HTMLElement;
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
export function elementRect(element: HTMLElement): Rect {
  const rect = element.getBoundingClientRect() as Rect;
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

interface PanelHandlers {
  show(): void;
  hide(): void;
}
// Adobe 7.3 types describe panels as an array; the real API accepts keyed panels.
// Constrain that declaration correction at the boundary, not throughout the UI.
interface PanelConfiguration {
  panels: Record<string, PanelHandlers>;
}
const setup = entrypoints.setup as unknown as (configuration: PanelConfiguration) => void;
export function setupPanels(configuration: PanelConfiguration): void {
  setup.call(entrypoints, configuration);
}
