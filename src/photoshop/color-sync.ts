import type * as Photoshop from "photoshop";
import { clone, same } from "../color/conversions.js";
import type { Colors, ColorWrite, RGB } from "../color/types.js";
import { swatches } from "../color/types.js";
// Host access and serialization are isolated from UI. Only edited channels are written.
export function createColorSync<Request = undefined>(
  ps: typeof Photoshop,
  onError: (error: unknown, request: Request | undefined) => void = () => {},
  onSuccess: (fresh: Colors, target: ColorWrite, request: Request | undefined) => void = () => {},
) {
  const { app, core } = ps;
  let pending: ColorWrite | null = null,
    running = false;
  let pendingRequest: Request | undefined;
  const readRgb = (c: InstanceType<typeof ps.app.SolidColor>): RGB => ({
    r: Math.round(c.rgb.red),
    g: Math.round(c.rgb.green),
    b: Math.round(c.rgb.blue),
  });
  const read = () => ({ fg: readRgb(app.foregroundColor), bg: readRgb(app.backgroundColor) });
  const solid = (rgb: RGB) => {
    const c = new app.SolidColor();
    c.rgb.red = rgb.r;
    c.rgb.green = rgb.g;
    c.rgb.blue = rgb.b;
    return c;
  };
  async function drain() {
    if (running) return;
    running = true;
    try {
      while (pending) {
        const target = pending;
        const request = pendingRequest;
        pending = null;
        pendingRequest = undefined;
        try {
          await core.executeAsModal(
            async () => {
              const fresh = read();
              if (target.fg && !same(target.fg, fresh.fg)) app.foregroundColor = solid(target.fg);
              if (target.bg && !same(target.bg, fresh.bg)) app.backgroundColor = solid(target.bg);
            },
            { commandName: "Choose color", timeOut: 1.5 },
          );
          onSuccess(read(), target, request);
        } catch (error) {
          onError(error, request);
        }
      }
    } finally {
      running = false;
    }
  }
  return {
    read,
    get busy() {
      return running || !!pending;
    },
    write(target: ColorWrite, request?: Request) {
      pending ??= {};
      pendingRequest = request;
      for (const key of swatches) {
        const color = target[key];
        if (color) pending[key] = clone(color);
      }
      return drain();
    },
  };
}
