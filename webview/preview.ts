import type { ColorVersions, HostMessage } from "../src/bridge/protocol.js";
import {
  BRIDGE,
  isClientMessage,
  isPickerState,
  PLUGIN_ID,
  PROTOCOL,
} from "../src/bridge/protocol.js";
import { PickerModel } from "../src/picker/model.js";

// Development entry only. Never imported by the packaged WebView.
export function installPreviewHost() {
  const model = new PickerModel();
  const storageKey = "kio.preview.state";
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null") as {
      state?: unknown;
    } | null;
    if (isPickerState(saved?.state)) model.state = saved.state;
  } catch {
    /* Preview can also run with storage disabled. */
  }
  let session = "",
    seq = 0,
    revision = 0,
    operation = 0;
  let applied: ColorVersions = { fg: 0, bg: 0 };
  const deliver = (reason: HostMessage["reason"]) => {
    const message: HostMessage = {
      channel: BRIDGE,
      version: PROTOCOL,
      session,
      type: "state",
      seq,
      committedSeq: seq,
      operation,
      applied: { ...applied },
      revision: ++revision,
      reason,
      state: model.snapshot(),
      error: "",
      visible: true,
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(message));
    } catch {
      /* Session only. */
    }
    queueMicrotask(() => {
      const event = new Event("message");
      Object.defineProperties(event, {
        source: { value: window.uxpHost },
        origin: { value: PLUGIN_ID },
        data: { value: message },
      });
      window.dispatchEvent(event);
    });
  };
  window.uxpHost = {
    postMessage(value: unknown) {
      if (!isClientMessage(value)) return;
      if (value.type === "ready") {
        session = value.session;
        seq = operation = 0;
        applied = { fg: 0, bg: 0 };
        deliver("initial");
        return;
      }
      if (value.session !== session || value.seq <= seq) {
        deliver("ack");
        return;
      }
      seq = value.seq;
      operation = value.operation;
      model.state = value.state;
      applied = {
        fg: Math.max(applied.fg, value.writes.fg),
        bg: Math.max(applied.bg, value.writes.bg),
      };
      deliver("ack");
    },
  };
}
