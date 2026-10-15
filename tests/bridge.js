const assert = require("node:assert/strict");
const { PickerModel } = require("../build/picker/model.js");
const { createController } = require("../build/bridge/controller.js");
const { isClientMessage, isHostMessage, BRIDGE, PROTOCOL } = require("../build/bridge/protocol.js");
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
      this.rgb = { red: 100, green: 0, blue: 0 };
    }
  }
  return {
    app: { SolidColor, foregroundColor: new SolidColor(), backgroundColor: new SolidColor() },
    core: { executeAsModal: async (fn) => fn() },
  };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
function client(controller, session = "client") {
  const envelope = { channel: BRIDGE, version: PROTOCOL, session };
  controller.show();
  controller.receive({ ...envelope, type: "ready" });
  const model = new PickerModel();
  model.state = controller.model.snapshot();
  let seq = 0;
  const writes = { fg: 0, bg: 0 };
  const packet = (command) => {
    model.apply(command);
    seq++;
    if (command.kind === "hsv" || command.kind === "rgb") {
      writes[model.state.active] = seq;
      if (model.state.linked) writes[model.state.active === "fg" ? "bg" : "fg"] = seq;
    }
    return {
      ...envelope,
      type: "update",
      seq,
      operation: 1,
      final: (command.kind !== "hsv" && command.kind !== "rgb") || command.final,
      state: model.snapshot(),
      writes: { ...writes },
    };
  };
  return {
    model,
    packet,
    send(command) {
      const value = packet(command);
      controller.receive(value);
      return value;
    },
  };
}
async function run() {
  const messages = [],
    settings = new Map(),
    host = mockHost();
  const storage = {
    getItem: (key) => settings.get(key) ?? null,
    setItem: (key, value) => settings.set(key, value),
  };
  const controller = createController(host, (value) => messages.push(value), storage);
  const ui = client(controller);
  assert.ok(isHostMessage(messages.at(-1)));
  const missing = ui.packet({ kind: "rgb", value: { r: 12, g: 34, b: 56 }, final: false });
  const final = ui.packet({ kind: "finish" });
  controller.receive(final); // The entire intermediate stream can be missing.
  await flush();
  assert.deepEqual(host.app.foregroundColor.rgb, { red: 12, green: 34, blue: 56 });
  assert.equal(messages.at(-1).committedSeq, final.seq);
  assert.equal(messages.at(-1).applied.fg, missing.seq);
  controller.receive(missing);
  assert.deepEqual(
    controller.model.snapshot(),
    ui.model.snapshot(),
    "Old operations cannot roll state back",
  );
  ui.send({ kind: "link", linked: true });
  assert.equal(settings.get("kio.linked"), "true");
  ui.send({ kind: "link", linked: false });

  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let calls = 0;
  host.core.executeAsModal = async (fn) => {
    calls++;
    await gate;
    return fn();
  };
  const held = ui.send({ kind: "rgb", value: { r: 7, g: 8, b: 9 }, final: true });
  assert.equal(messages.at(-1).seq, held.seq);
  assert.ok(
    messages.at(-1).committedSeq < held.seq,
    "Receipt is not a successful write acknowledgement",
  );
  assert.ok(messages.at(-1).applied.fg < held.writes.fg);
  for (let i = 0; i < 100; i++)
    ui.send({ kind: "rgb", value: { r: i, g: 20, b: 30 }, final: false });
  ui.send({ kind: "select", swatch: "bg" });
  ui.send({ kind: "rgb", value: { r: 3, g: 4, b: 5 }, final: true });
  const wanted = ui.send({ kind: "finish" });
  host.app.foregroundColor.rgb.red = 255;
  controller.poll();
  assert.deepEqual(
    controller.model.snapshot(),
    wanted.state,
    "Host polling cannot take ownership during a write",
  );
  release();
  await flush();
  assert.equal(
    calls,
    2,
    "Only in-flight and latest queued targets are written, not 100 old motions",
  );
  assert.deepEqual(host.app.foregroundColor.rgb, { red: 99, green: 20, blue: 30 });
  assert.deepEqual(host.app.backgroundColor.rgb, { red: 3, green: 4, blue: 5 });
  assert.equal(messages.at(-1).committedSeq, wanted.seq);
  assert.deepEqual(messages.at(-1).applied, wanted.writes);
  const before = calls;
  controller.receive(wanted);
  await flush();
  assert.equal(calls, before, "Retransmitting a committed final packet is idempotent");

  let fail = true;
  host.core.executeAsModal = async (fn) => {
    if (fail) {
      fail = false;
      throw Error("host busy");
    }
    return fn();
  };
  const failed = ui.send({ kind: "rgb", value: { r: 80, g: 90, b: 100 }, final: true });
  await flush();
  assert.match(messages.at(-1).error, /host busy/);
  assert.ok(messages.at(-1).committedSeq < failed.seq);
  host.app.backgroundColor.rgb.green = 255;
  controller.poll();
  assert.deepEqual(
    controller.model.snapshot(),
    failed.state,
    "Failure keeps local intent instead of reverting to host colors",
  );
  controller.receive(failed);
  await flush();
  assert.match(
    messages.at(-1).error,
    /host busy/,
    "A duplicate packet does not silently retry a modal error",
  );
  const retry = { ...failed, seq: failed.seq + 1 };
  controller.receive(retry);
  await flush();
  assert.equal(messages.at(-1).error, "");
  assert.equal(messages.at(-1).committedSeq, retry.seq);
  assert.deepEqual(host.app.backgroundColor.rgb, { red: 80, green: 90, blue: 100 });
  host.app.foregroundColor.rgb.blue = 200;
  controller.poll();
  assert.equal(messages.at(-1).reason, "external");
  assert.equal(messages.at(-1).state.colors.fg.b, 200, "Genuine idle Photoshop edits are accepted");
  for (let i = 1; i < messages.length; i++)
    assert.ok(messages[i].revision > messages[i - 1].revision);

  const ready = { channel: BRIDGE, version: PROTOCOL, session: "replacement", type: "ready" };
  controller.receive(ready);
  controller.receive({ ...ready, session: "client" });
  assert.equal(messages.at(-1).session, "replacement", "Retired WebViews cannot reclaim ownership");
  assert.equal(messages.at(-1).seq, 0);
  controller.hide();
  assert.equal(messages.at(-1).visible, false);
  assert.equal(isHostMessage({ ...messages.at(-1), committedSeq: 9999 }), false);
  assert.equal(isHostMessage({ ...messages.at(-1), revision: undefined }), false);
  for (const invalid of [
    null,
    {},
    { ...wanted, version: 1 },
    { ...wanted, operation: 999999 },
    { ...wanted, writes: { fg: wanted.seq + 1, bg: 0 } },
    {
      ...wanted,
      state: {
        ...wanted.state,
        colors: { fg: { r: 999, g: 0, b: 0 }, bg: wanted.state.colors.bg },
      },
    },
  ])
    assert.equal(isClientMessage(invalid), false);
  console.log(
    "PASS full final-state recovery, exact successful-write versions, latest-only queue, idempotent retransmit, failure/retry ownership, idle host edits and session isolation",
  );
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
