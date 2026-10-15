import type { HostMessage } from "../src/bridge/protocol.js";
import { BRIDGE, isClientMessage, isHostMessage, PLUGIN_ID } from "../src/bridge/protocol.js";
import { PickerModel } from "../src/picker/model.js";

// Development entry only. Never imported by the packaged WebView.
export function installPreviewHost() {
  const model = new PickerModel();
  const storageKey = "kio.preview.state";
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (isHostMessage(saved)) model.state = saved.state;
  } catch {
    /* Preview can also run with storage disabled. */
  }
  let session = "",
    seq = 0;
  const deliver = () => {
    const message: HostMessage = {
      channel: BRIDGE,
      version: 1,
      session,
      type: "state",
      seq,
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
        seq = 0;
        deliver();
        return;
      }
      if (value.session !== session || value.seq <= seq) return;
      seq = value.seq;
      model.apply(value.command);
      deliver();
    },
  };
}
