import { clamp, clone, hsvToRgb, normalizedHue, rgbToHsv, same } from "../color/conversions.js";
import { linkedColor, relation } from "../color/state.js";
import type { Colors, HSV, RGB, Swatch } from "../color/types.js";
import { swatches } from "../color/types.js";

export interface PickerState {
  colors: Colors;
  hsv: Record<Swatch, HSV>;
  active: Swatch;
  linked: boolean;
  relative: HSV;
}
export type Command =
  | { kind: "select"; swatch: Swatch }
  | { kind: "link"; linked: boolean }
  | { kind: "hsv"; value: HSV; final: boolean }
  | { kind: "rgb"; value: RGB; final: boolean }
  | { kind: "finish" };

export class PickerModel {
  state: PickerState;
  private observed: Record<Swatch, RGB | null> = { fg: null, bg: null };
  constructor(linked = false) {
    const colors = { fg: { r: 142, g: 41, b: 36 }, bg: { r: 153, g: 43, b: 31 } };
    const hsv = { fg: rgbToHsv(colors.fg), bg: rgbToHsv(colors.bg) };
    this.state = { colors, hsv, active: "fg", linked, relative: relation(hsv.fg, hsv.bg) };
  }
  snapshot(): PickerState {
    return JSON.parse(JSON.stringify(this.state)) as PickerState;
  }
  apply(command: Command): boolean {
    const state = this.state;
    if (command.kind === "select") {
      state.active = command.swatch;
      return false;
    }
    if (command.kind === "link") {
      state.linked = command.linked;
      if (state.linked) state.relative = relation(state.hsv.fg, state.hsv.bg);
      return false;
    }
    if (command.kind === "finish") return false;
    const active = state.active;
    if (command.kind === "hsv") {
      const { h, s, v } = command.value;
      state.hsv[active] = { h: normalizedHue(h), s: clamp(s, 0, 1), v: clamp(v, 0, 1) };
      state.colors[active] = hsvToRgb(h, s, v);
    } else {
      state.colors[active] = clone(command.value);
      state.hsv[active] = rgbToHsv(command.value, state.hsv[active].h, state.hsv[active].s);
    }
    this.derive(active);
    return true;
  }
  private derive(changed: Swatch) {
    if (!this.state.linked) return;
    const other = changed === "fg" ? "bg" : "fg";
    const hsv = linkedColor(
      this.state.hsv[changed],
      this.state.relative,
      changed === "fg" ? 1 : -1,
    );
    this.state.hsv[other] = hsv;
    this.state.colors[other] = hsvToRgb(hsv.h, hsv.s, hsv.v);
  }
  acknowledge(fresh: Colors, target: Partial<Colors>) {
    for (const key of swatches) {
      if (!target[key]) continue;
      this.observed[key] = clone(fresh[key]);
      if (same(this.state.colors[key], target[key])) this.state.colors[key] = clone(fresh[key]);
    }
  }
  ingest(fresh: Colors, force = false): { changed: boolean; write: boolean } {
    const fg = !same(fresh.fg, this.observed.fg);
    const bg = !same(fresh.bg, this.observed.bg);
    if (!force && !fg && !bg) return { changed: false, write: false };
    for (const key of swatches) {
      if (!(key === "fg" ? fg : bg)) continue;
      const old = this.state.hsv[key];
      this.state.colors[key] = clone(fresh[key]);
      if (!same(fresh[key], hsvToRgb(old.h, old.s, old.v)))
        this.state.hsv[key] = rgbToHsv(fresh[key], old.h, old.s);
    }
    this.observed = { fg: clone(fresh.fg), bg: clone(fresh.bg) };
    const write = this.state.linked && !force && fg !== bg;
    if (write) this.derive(fg ? "fg" : "bg");
    else if (this.state.linked && fg && bg)
      this.state.relative = relation(this.state.hsv.fg, this.state.hsv.bg);
    return { changed: true, write };
  }
  target(): Partial<Colors> {
    const { colors, linked, active } = this.state;
    return linked
      ? { fg: clone(colors.fg), bg: clone(colors.bg) }
      : { [active]: clone(colors[active]) };
  }
}
