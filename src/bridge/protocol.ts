import type { HSV, RGB } from "../color/types.js";
import type { Command, PickerState } from "../picker/model.js";

export const BRIDGE = "kio-color-picker";
export const PLUGIN_ID = "com.kiochan.colorpicker";
interface Envelope {
  channel: typeof BRIDGE;
  version: 1;
  session: string;
}
export type ClientMessage = Envelope &
  ({ type: "ready" } | { type: "command"; seq: number; command: Command });
export type HostMessage = Envelope & {
  type: "state";
  seq: number;
  state: PickerState;
  error: string;
  visible: boolean;
};
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function finite(value: unknown, lo: number, hi: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= lo && value <= hi;
}
function hsv(value: unknown): value is HSV {
  return record(value) && finite(value.h, 0, 360) && finite(value.s, 0, 1) && finite(value.v, 0, 1);
}
function rgb(value: unknown): value is RGB {
  return (
    record(value) &&
    [value.r, value.g, value.b].every((v) => finite(v, 0, 255) && Number.isInteger(v))
  );
}
function envelope(value: unknown): value is Record<string, unknown> & Envelope {
  return (
    record(value) &&
    value.channel === BRIDGE &&
    value.version === 1 &&
    typeof value.session === "string" &&
    value.session.length > 0 &&
    value.session.length <= 100
  );
}
export function isCommand(value: unknown): value is Command {
  if (!record(value)) return false;
  switch (value.kind) {
    case "select":
      return value.swatch === "fg" || value.swatch === "bg";
    case "link":
      return typeof value.linked === "boolean";
    case "hsv":
      return hsv(value.value) && typeof value.final === "boolean";
    case "rgb":
      return rgb(value.value) && typeof value.final === "boolean";
    case "finish":
      return true;
    default:
      return false;
  }
}
export function isClientMessage(value: unknown): value is ClientMessage {
  return (
    envelope(value) &&
    (value.type === "ready" ||
      (value.type === "command" &&
        finite(value.seq, 1, Number.MAX_SAFE_INTEGER) &&
        Number.isInteger(value.seq) &&
        isCommand(value.command)))
  );
}
export function isHostMessage(value: unknown): value is HostMessage {
  if (
    !envelope(value) ||
    value.type !== "state" ||
    !finite(value.seq, 0, Number.MAX_SAFE_INTEGER) ||
    !Number.isInteger(value.seq) ||
    typeof value.error !== "string" ||
    typeof value.visible !== "boolean"
  )
    return false;
  const state = value.state;
  return (
    record(state) &&
    (state.active === "fg" || state.active === "bg") &&
    typeof state.linked === "boolean" &&
    record(state.colors) &&
    rgb(state.colors.fg) &&
    rgb(state.colors.bg) &&
    record(state.hsv) &&
    hsv(state.hsv.fg) &&
    hsv(state.hsv.bg) &&
    record(state.relative) &&
    finite(state.relative.h, -360, 360) &&
    finite(state.relative.s, -1, 1) &&
    finite(state.relative.v, -1, 1)
  );
}
