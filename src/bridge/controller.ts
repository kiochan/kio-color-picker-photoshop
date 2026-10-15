import type * as Photoshop from "photoshop";
import { createColorSync } from "../photoshop/color-sync.js";
import { PickerModel } from "../picker/model.js";
import type { HostMessage } from "./protocol.js";
import { BRIDGE, isClientMessage } from "./protocol.js";

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
    error = "",
    visible = false,
    editing = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;
  const emit = () => {
    if (session)
      send({
        channel: BRIDGE,
        version: 1,
        session,
        type: "state",
        seq,
        state: model.snapshot(),
        error,
        visible,
      });
  };
  const sync = createColorSync(
    ps,
    (failure) => {
      error = `Cannot write Photoshop colors: ${failure instanceof Error ? failure.message : String(failure)}`;
      emit();
    },
    (fresh, target) => {
      model.acknowledge(fresh, target);
      error = "";
      emit();
    },
  );
  const flush = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (!pending) return;
    pending = false;
    void sync.write(model.target());
  };
  function poll(force = false) {
    if (!visible || sync.busy || pending || editing) return;
    try {
      const result = model.ingest(sync.read(), force);
      if (result.write) {
        pending = true;
        flush();
      }
      if (result.changed) emit();
    } catch {
      error = "Cannot read Photoshop colors";
      emit();
    }
  }
  return {
    model,
    poll,
    show() {
      visible = true;
      poll(true);
      emit();
    },
    hide() {
      editing = false;
      flush();
      visible = false;
      emit();
    },
    receive(value: unknown) {
      if (!isClientMessage(value)) return;
      if (value.type === "ready") {
        if (session !== value.session) {
          editing = false;
          flush();
          session = value.session;
          seq = 0;
        }
        poll(true);
        emit();
        return;
      }
      if (value.session !== session || value.seq <= seq || !visible) return;
      const command = value.command;
      // Flush the old target before switching swatches or link mode.
      if (command.kind === "select" || command.kind === "link") {
        editing = false;
        flush();
      }
      seq = value.seq;
      const write = model.apply(command);
      if (command.kind === "link") {
        try {
          storage.setItem("kio.linked", String(command.linked));
        } catch {
          /* Session fallback. */
        }
      }
      if (write && (command.kind === "hsv" || command.kind === "rgb")) {
        editing = !command.final;
        pending = true;
        if (command.final) flush();
        else if (timer === null) timer = setTimeout(flush, 40);
      }
      if (command.kind === "finish") {
        editing = false;
        flush();
      }
      emit();
    },
  };
}
