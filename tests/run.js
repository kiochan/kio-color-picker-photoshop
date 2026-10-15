const assert = require("node:assert/strict");
const C = require("../build/color/conversions.js"),
  G = require("../build/ui/geometry.js"),
  S = require("../build/color/state.js");
const { createColorSync } = require("../build/photoshop/color-sync.js");
function host(mapColor = (c) => c) {
  class SolidColor {
    constructor() {
      this.rgb = { red: 0, green: 0, blue: 0 };
    }
  }
  const solid = (rgb) => {
    const c = new SolidColor();
    Object.assign(c.rgb, { red: rgb.r, green: rgb.g, blue: rgb.b });
    return c;
  };
  let fg = solid({ r: 142, g: 41, b: 36 }),
    bg = solid({ r: 153, g: 43, b: 31 }),
    listener = () => {},
    writes = 0,
    calls = 0,
    gate = null,
    fail = false;
  const app = {
    SolidColor,
    get foregroundColor() {
      return fg;
    },
    set foregroundColor(c) {
      fg = mapColor(c);
      writes++;
      listener();
    },
    get backgroundColor() {
      return bg;
    },
    set backgroundColor(c) {
      bg = mapColor(c);
      writes++;
      listener();
    },
  };
  return {
    app,
    core: {
      async executeAsModal(fn, options) {
        assert.equal(options.timeOut, 1.5);
        calls++;
        if (gate) await gate;
        if (fail) {
          fail = false;
          throw Error("host busy");
        }
        await fn();
      },
    },
    action: {
      async addNotificationListener(_events, fn) {
        listener = fn;
      },
    },
    get writes() {
      return writes;
    },
    get calls() {
      return calls;
    },
    set gate(p) {
      gate = p;
    },
    set fail(v) {
      fail = v;
    },
    external(key, rgb) {
      if (key === "fg") fg = solid(rgb);
      else bg = solid(rgb);
      listener();
    },
  };
}

async function run() {
  const results = [];
  async function test(name, fn) {
    await fn();
    results.push(name);
  }
  await test("RGB/HSV round trips, hue wrapping, black and white", () => {
    for (let r = 0; r <= 255; r += 17)
      for (let g = 0; g <= 255; g += 17)
        for (let b = 0; b <= 255; b += 17) {
          const h = C.rgbToHsv({ r, g, b });
          assert.deepEqual(C.hsvToRgb(h.h, h.s, h.v), { r, g, b });
        }
    assert.equal(C.normalizedHue(-721), 359);
    assert.equal(C.normalizedHue(720), 0);
    assert.deepEqual(C.rgbToHsv({ r: 0, g: 0, b: 0 }, 123, 0.7), { h: 123, s: 0.7, v: 0 });
    assert.deepEqual(C.rgbToHsv({ r: 255, g: 255, b: 255 }, 123, 0.7), { h: 123, s: 0, v: 1 });
  });
  await test("HEX validation and actual RGB ramps", () => {
    assert.deepEqual(C.fromHex(" #8e2924 "), { r: 142, g: 41, b: 36 });
    for (const v of ["#12", "GGGGGG", "#1234567", "<script>"]) assert.equal(C.fromHex(v), null);
    for (const [k, a, b] of [
      ["r", "#002924", "#FF2924"],
      ["g", "#8E0024", "#8EFF24"],
      ["b", "#8E2900", "#8E29FF"],
    ])
      assert.equal(
        C.rgbGradient({ r: 142, g: 41, b: 36 }, k),
        `linear-gradient(90deg, ${a} 0%, ${b} 100%)`,
      );
  });
  await test("Entire SV domain is reachable and projects inside diamond", () => {
    for (let s = 0; s <= 100; s++)
      for (let v = 0; v <= 100; v++) {
        const p = G.hsvToPoint({ s: s / 100, v: v / 100 }),
          h = G.pointToSv(p, s / 100);
        assert.ok(Math.abs(h.s - s / 100) < 1e-12);
        assert.ok(Math.abs(h.v - v / 100) < 1e-12);
      }
    for (let x = -2; x <= 2; x += 0.1)
      for (let y = -2; y <= 2; y += 0.1) {
        const p = G.constrainToDiamond({ x, y });
        assert.ok(Math.abs(p.x - 0.5) + Math.abs(p.y - 0.5) <= 0.38000001);
      }
    assert.equal(G.pickerRegion({ x: 0.5, y: 0.04 }), "ring");
    assert.equal(G.pickerRegion({ x: 0.5, y: 0.5 }), "diamond");
    for (const [point, expected] of [
      [
        { x: 0.5, y: 0.12 },
        { r: 255, g: 255, b: 255 },
      ],
      [
        { x: 0.12, y: 0.5 },
        { r: 128, g: 128, b: 128 },
      ],
      [
        { x: 0.88, y: 0.5 },
        { r: 255, g: 0, b: 0 },
      ],
      [
        { x: 0.5, y: 0.88 },
        { r: 0, g: 0, b: 0 },
      ],
    ]) {
      const hsv = G.pointToSv(point);
      assert.deepEqual(C.hsvToRgb(0, hsv.s, hsv.v), expected);
    }
  });
  await test("Diamond spreads muted tones continuously across its interior", () => {
    const center = G.pointToSv({ x: 0.5, y: 0.5 });
    assert.deepEqual(C.hsvToRgb(0, center.s, center.v), { r: 159, g: 96, b: 96 });
    // A crease at the horizontal center used to change the gradient abruptly.
    for (const x of [0.3, 0.5, 0.7]) {
      const above = G.diamondTone({ x, y: 0.5 - 0.0001 });
      const middle = G.diamondTone({ x, y: 0.5 });
      const below = G.diamondTone({ x, y: 0.5 + 0.0001 });
      for (const key of ["white", "chroma"])
        assert.ok(Math.abs(above[key] + below[key] - 2 * middle[key]) < 1e-6);
    }
  });
  await test("Bidirectional linked offsets wrap and retain unclipped relation", () => {
    const a = { h: 350, s: 0.2, v: 0.4 },
      b = { h: 10, s: 0.7, v: 0.8 },
      rel = S.relation(a, b);
    assert.equal(rel.h, 20);
    const linked = S.linkedColor(a, rel, 1);
    assert.ok(Math.abs(linked.s - b.s) < 1e-12);
    assert.equal(linked.h, b.h);
    assert.ok(Math.abs(S.linkedColor(b, rel, -1).v - a.v) < 1e-12);
    assert.equal(S.linkedColor({ h: 359, s: 1, v: 1 }, rel, 1).s, 1);
    assert.equal(rel.s, 0.49999999999999994);
  });
  await test("Layout math fits minimum, tall, short and wide panels", () => {
    for (const [w, h] of [
      [205, 290],
      [310, 455],
      [1000, 290],
      [205, 1400],
      [2200, 2200],
    ]) {
      const a = G.layout(w - 14, h - 58);
      assert.ok(a.dimension <= 480);
      assert.ok(a.dimension <= w - 26);
      assert.ok(a.dimension + 84 <= h - 58);
      assert.ok(a.railWidth <= w - 20);
    }
  });
  await test("Serialized latest writes preserve untouched external swatch", async () => {
    const ps = host(),
      errors = [],
      sync = createColorSync(ps, (e) => errors.push(e));
    let release;
    ps.gate = new Promise((r) => (release = r));
    const first = sync.write({ fg: { r: 1, g: 2, b: 3 } });
    sync.write({ fg: { r: 4, g: 5, b: 6 } });
    sync.write({ fg: { r: 7, g: 8, b: 9 } });
    ps.external("bg", { r: 20, g: 30, b: 40 });
    release();
    await first;
    assert.deepEqual(sync.read(), { fg: { r: 7, g: 8, b: 9 }, bg: { r: 20, g: 30, b: 40 } });
    assert.equal(ps.calls, 2);
    assert.equal(sync.busy, false);
    assert.equal(errors.length, 0);
    await sync.write({ fg: { r: 7, g: 8, b: 9 } });
    assert.equal(ps.writes, 2);
  });
  await test("Failure releases queue and later gesture can recover", async () => {
    const ps = host(),
      errors = [],
      sync = createColorSync(ps, (e) => errors.push(e));
    ps.fail = true;
    await sync.write({ fg: { r: 1, g: 1, b: 1 } });
    assert.equal(errors.length, 1);
    assert.equal(sync.busy, false);
    await sync.write({ fg: { r: 2, g: 2, b: 2 } });
    assert.equal(sync.read().fg.r, 2);
  });
  return results;
}
module.exports = { run };
if (require.main === module)
  run()
    .then((r) => console.log(`${r.map((n) => `PASS ${n}`).join("\n")}\n${r.length} suites passed`))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    });
