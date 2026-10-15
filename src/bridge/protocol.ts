import type { HSV, RGB, Swatch } from "../color/types.js";
import type { PickerState } from "../picker/model.js";

export const BRIDGE = "kio-color-picker";
export const PLUGIN_ID = "com.kiochan.colorpicker";
export const PROTOCOL = 2;
export type ColorVersions = Record<Swatch, number>;
interface Envelope {
  channel: typeof BRIDGE;
  version: typeof PROTOCOL;
  session: string;
}
export type Update = Envelope & {
  type: "update";
  seq: number;
  operation: number;
  final: boolean;
  state: PickerState;
  writes: ColorVersions;
};
export type ClientMessage = Update | (Envelope & { type: "ready" });
export type HostMessage = Envelope & {
  type: "state";
  seq: number;
  committedSeq: number;
  operation: number;
  applied: ColorVersions;
  revision: number;
  reason: "initial" | "external" | "ack" | "lifecycle";
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
function counter(value: unknown, max = Number.MAX_SAFE_INTEGER): value is number {
  return finite(value, 0, max) && Number.isInteger(value);
}
function hsv(value: unknown): value is HSV {
  return record(value) && finite(value.h, 0, 360) && finite(value.s, 0, 1) && finite(value.v, 0, 1);
}
function rgb(value: unknown): value is RGB {
  return record(value) && [value.r, value.g, value.b].every((v) => counter(v, 255));
}
export function isPickerState(state: unknown): state is PickerState {
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
function envelope(value: unknown): value is Record<string, unknown> & Envelope {
  return (
    record(value) &&
    value.channel === BRIDGE &&
    value.version === PROTOCOL &&
    typeof value.session === "string" &&
    value.session.length > 0 &&
    value.session.length <= 100
  );
}
function versions(value: unknown, max: number): value is ColorVersions {
  return record(value) && counter(value.fg, max) && counter(value.bg, max);
}
export function isClientMessage(value: unknown): value is ClientMessage {
  if (!envelope(value)) return false;
  if (value.type === "ready") return true;
  return (
    value.type === "update" &&
    counter(value.seq) &&
    value.seq > 0 &&
    counter(value.operation, value.seq) &&
    value.operation > 0 &&
    typeof value.final === "boolean" &&
    isPickerState(value.state) &&
    versions(value.writes, value.seq)
  );
}
export function isHostMessage(value: unknown): value is HostMessage {
  return (
    envelope(value) &&
    value.type === "state" &&
    counter(value.seq) &&
    counter(value.committedSeq, value.seq) &&
    counter(value.operation, value.seq) &&
    versions(value.applied, value.seq) &&
    counter(value.revision) &&
    value.revision > 0 &&
    ["initial", "external", "ack", "lifecycle"].includes(String(value.reason)) &&
    typeof value.error === "string" &&
    typeof value.visible === "boolean" &&
    isPickerState(value.state)
  );
}
