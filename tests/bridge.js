const assert = require("node:assert/strict");
const { PickerModel } = require("../build/picker/model.js");
const { createController } = require("../build/bridge/controller.js");
const { isClientMessage, isHostMessage, BRIDGE } = require("../build/bridge/protocol.js");
const { hsvToRgb } = require("../build/color/conversions.js");
const { relation } = require("../build/color/state.js");
const state = new PickerModel();
state.apply({ kind: "hsv", value: { h: 123, s: 0.72, v: 0 }, final: true });
state.acknowledge(
  { fg: { r: 0, g: 0, b: 0 }, bg: state.state.colors.bg },
  { fg: { r: 0, g: 0, b: 0 } },
);
state.ingest(state.state.colors, true);
assert.deepEqual(state.state.hsv.fg, { h: 123, s: 0.72, v: 0 });
state.apply({ kind: "link", linked: true });
const offset = { ...state.state.relative };
state.apply({ kind: "hsv", value: { h: 151, s: 0.45, v: 0.5 }, final: true });
assert.deepEqual(state.state.relative, offset);
state.acknowledge(state.state.colors, state.state.colors);
const external = { fg: state.state.colors.fg, bg: hsvToRgb(220, 0.4, 0.7) };
assert.equal(state.ingest(external).write, true);
assert.deepEqual(state.state.relative, offset);
assert.notDeepEqual(state.state.colors.fg, external.fg);
// Two simultaneous host edits reset the relationship instead of chasing each other.
state.ingest({ fg: hsvToRgb(12, 0.2, 0.5), bg: hsvToRgb(232, 0.6, 0.9) });
assert.deepEqual(state.state.relative, relation(state.state.hsv.fg, state.state.hsv.bg));
// Color-managed write echoes are acknowledgements, not another linked external edit.
const managed = new PickerModel(true);
managed.apply({ kind: "hsv", value: { h: 335, s: 0.08, v: 0.92 }, final: true });
const target = managed.target();
const fresh = {
  fg: { ...target.fg, r: target.fg.r - 1 },
  bg: { ...target.bg, b: target.bg.b - 1 },
};
managed.acknowledge(fresh, target);
assert.deepEqual(managed.state.hsv.fg, { h: 335, s: 0.08, v: 0.92 });
assert.deepEqual(managed.ingest(fresh), { changed: false, write: false });

function mockHost() {
  class SolidColor {
    constructor() {
      this.rgb = { red: 0, green: 0, blue: 0 };
    }
  }
  const solid = () => {
    const c = new SolidColor();
    c.rgb.red = 100;
    return c;
  };
  return {
    app: { SolidColor, foregroundColor: solid(), backgroundColor: solid() },
    core: { executeAsModal: async (fn) => fn() },
  };
}
async function run() {
  const host = mockHost(),
    messages = [],
    settings = new Map();
  const controller = createController(host, (value) => messages.push(value), {
    getItem: (key) => settings.get(key) ?? null,
    setItem: (key, value) => settings.set(key, value),
  });
  const envelope = { channel: BRIDGE, version: 1, session: "first" };
  const ready = { ...envelope, type: "ready" };
  let seq = 0;
  const send = (command) =>
    controller.receive({ ...envelope, type: "command", seq: ++seq, command });
  controller.show();
  controller.receive(ready);
  assert.ok(isHostMessage(messages.at(-1)));
  assert.equal(messages.at(-1).visible, true);
  send({ kind: "link", linked: true });
  assert.equal(settings.get("kio.linked"), "true");
  send({ kind: "link", linked: false });
  send({ kind: "hsv", value: { h: 120, s: 0.8, v: 0.7 }, final: false });
  const edited = controller.model.snapshot();
  host.app.backgroundColor.rgb.blue = 99;
  controller.poll();
  assert.deepEqual(
    controller.model.snapshot(),
    edited,
    "Do not overwrite a gesture with host polling",
  );
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(
    host.app.foregroundColor.rgb,
    { red: 36, green: 179, blue: 36 },
    "Continuous dragging reaches Photoshop before release",
  );
  send({ kind: "finish" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(host.app.foregroundColor.rgb, { red: 36, green: 179, blue: 36 });
  assert.equal(
    host.app.backgroundColor.rgb.blue,
    99,
    "Independent edit preserves the other host swatch",
  );
  const before = controller.model.snapshot();
  controller.receive({
    ...envelope,
    type: "command",
    seq: 1,
    command: { kind: "select", swatch: "bg" },
  });
  controller.receive({
    ...envelope,
    session: "stale",
    type: "command",
    seq: 999,
    command: { kind: "link", linked: true },
  });
  assert.deepEqual(
    controller.model.snapshot(),
    before,
    "Ignore reordered or stale-session commands",
  );
  for (const invalid of [
    null,
    {},
    { ...ready, version: 2 },
    { ...ready, session: "" },
    {
      ...envelope,
      type: "command",
      seq: 99,
      command: { kind: "hsv", value: { h: NaN, s: 1, v: 1 }, final: true },
    },
    {
      ...envelope,
      type: "command",
      seq: 99,
      command: { kind: "rgb", value: { r: 256, g: 0, b: 0 }, final: true },
    },
  ]) {
    assert.equal(isClientMessage(invalid), false);
    controller.receive(invalid);
  }
  controller.hide();
  assert.equal(messages.at(-1).visible, false);
  send({ kind: "link", linked: true });
  assert.equal(controller.model.state.linked, false, "Ignore hidden panel commands");
  controller.show();
  controller.receive({ ...ready, session: "reload" });
  assert.equal(messages.at(-1).seq, 0);
  assert.equal(messages.at(-1).session, "reload");
  const reloaded = createController(host, () => {}, { getItem: () => "true", setItem() {} });
  assert.equal(reloaded.model.state.linked, true);
  // Modal failures must surface, release the queue, and allow the next gesture.
  let fail = true;
  host.core.executeAsModal = async (fn) => {
    if (fail) {
      fail = false;
      throw Error("host busy");
    }
    return fn();
  };
  controller.receive({
    ...ready,
    type: "command",
    session: "reload",
    seq: 1,
    command: { kind: "rgb", value: { r: 1, g: 2, b: 3 }, final: true },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(messages.at(-1).error, /host busy/);
  controller.receive({
    ...ready,
    type: "command",
    session: "reload",
    seq: 2,
    command: { kind: "rgb", value: { r: 4, g: 5, b: 6 }, final: true },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(messages.at(-1).error, "");
  assert.deepEqual(host.app.foregroundColor.rgb, { red: 4, green: 5, blue: 6 });
  console.log(
    "PASS precise HSV, linked host edits, persisted settings, bridge validation/order/reload, gesture flush, modal recovery",
  );
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
