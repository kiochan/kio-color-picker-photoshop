import type * as Photoshop from "photoshop";
import type { ColorWrite } from "../color/types.js";
import { swatches } from "../color/types.js";
import { createColorSync } from "../photoshop/color-sync.js";
import { PickerModel } from "../picker/model.js";
import type { ColorVersions, HostMessage, Update } from "./protocol.js";
import { BRIDGE, isClientMessage, PROTOCOL } from "./protocol.js";

interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export function createController(
  ps: typeof Photoshop,
  send: (message: HostMessage) => void,
  storage: Storage,
) {
  let linked = false;
  try {
    linked = storage.getItem("kio.linked") === "true";
  } catch {
    /* Session fallback. */
  }
  const model = new PickerModel(linked);
  let session = "",
    seq = 0,
    committedSeq = 0,
    revision = 0,
    operation = 0;
  let error = "",
    visible = false,
    editing = false;
  let applied: ColorVersions = { fg: 0, bg: 0 };
  let latest: Update | null = null;
  let pending: Update | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const retiredSessions = new Set<string>();
  const covered = () =>
    latest === null || swatches.every((key) => applied[key] >= (latest?.writes[key] ?? 0));
  function emit(reason: HostMessage["reason"]) {
    if (session)
      send({
        channel: BRIDGE,
        version: PROTOCOL,
        session,
        type: "state",
        seq,
        committedSeq,
        operation,
        applied: { ...applied },
        revision: ++revision,
        reason,
        state: model.snapshot(),
        error,
        visible,
      });
  }
  function confirm() {
    if (covered() && !error) committedSeq = seq;
  }
  const sync = createColorSync<Update>(
    ps,
    (failure, request) => {
      if (request && request.session !== session) return;
      // A failed superseded request cannot turn the current operation into an error.
      if (!request || request.seq === seq) {
        error = `Cannot write Photoshop colors: ${failure instanceof Error ? failure.message : String(failure)}`;
        emit("ack");
      }
    },
    (fresh, target, request) => {
      model.acknowledge(fresh, target);
      if (request?.session === session) {
        for (const key of swatches)
          if (target[key]) applied[key] = Math.max(applied[key], request.writes[key]);
        if (covered()) error = "";
        confirm();
      }
      emit("ack");
    },
  );
  function flush() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    const request = pending;
    pending = null;
    if (!request) return;
    const target: ColorWrite = {};
    for (const key of swatches)
      if (request.writes[key] > applied[key]) target[key] = { ...request.state.colors[key] };
    if (Object.keys(target).length) void sync.write(target, request);
    else {
      confirm();
      emit("ack");
    }
  }
  function poll() {
    // Local intent owns the colors until its exact versions have succeeded.
    if (!visible || sync.busy || pending || editing || !covered()) return;
    try {
      const previousError = error;
      const result = model.ingest(sync.read());
      error = "";
      if (result.write) void sync.write(model.target());
      if (result.changed) emit("external");
      else if (previousError) emit("ack");
    } catch {
      error = "Cannot read Photoshop colors";
      emit("ack");
    }
  }
  return {
    model,
    poll,
    show() {
      visible = true;
      poll();
      emit("lifecycle");
    },
    hide() {
      editing = false;
      flush();
      visible = false;
      emit("lifecycle");
    },
    receive(value: unknown) {
      if (!isClientMessage(value)) return;
      if (value.type === "ready") {
        if (session !== value.session) {
          if (retiredSessions.has(value.session)) return;
          if (session) retiredSessions.add(session);
          flush();
          session = value.session;
          seq = committedSeq = operation = 0;
          applied = { fg: 0, bg: 0 };
          latest = null;
          editing = false;
          error = "";
        }
        poll();
        emit("initial");
        return;
      }
      if (value.session !== session) return;
      if (value.seq <= seq) {
        emit("ack");
        return;
      }
      // Every frame is self-contained. Missing intermediate frames never block a commit.
      seq = value.seq;
      operation = value.operation;
      latest = value;
      model.state = JSON.parse(JSON.stringify(value.state)) as typeof model.state;
      editing = !value.final;
      error = "";
      try {
        storage.setItem("kio.linked", String(value.state.linked));
      } catch {
        /* Session fallback. */
      }
      pending = value;
      if (value.final) flush();
      else if (timer === null) timer = setTimeout(flush, 40);
      confirm();
      emit("ack");
    },
  };
}
