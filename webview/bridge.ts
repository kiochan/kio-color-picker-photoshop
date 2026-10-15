import type { ClientMessage, ColorVersions, HostMessage, Update } from "../src/bridge/protocol.js";
import { BRIDGE, isHostMessage, PLUGIN_ID, PROTOCOL } from "../src/bridge/protocol.js";
import { swatches } from "../src/color/types.js";
import type { Command, PickerState } from "../src/picker/model.js";

export type SyncPhase = "idle" | "syncing" | "delayed" | "error";
export function createBridge(
  receive: (message: HostMessage, acceptState: boolean) => void,
  status: (phase: SyncPhase) => void = () => {},
) {
  const session =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let seq = 0,
    operation = 0,
    revision = 0,
    confirmed = 0,
    since = Date.now();
  let connected = false,
    editing = false;
  let frame: number | null = null;
  let latest: Update | null = null;
  let phase: SyncPhase = "idle";
  const dirty: ColorVersions = { fg: 0, bg: 0 };
  const change = (next: SyncPhase) => {
    if (next !== phase) {
      phase = next;
      status(next);
    }
  };
  const post = (value: ClientMessage) => {
    try {
      if (!window.uxpHost) {
        change("delayed");
        return;
      }
      window.uxpHost.postMessage(value);
    } catch {
      change("delayed");
    }
  };
  const ready = () => post({ channel: BRIDGE, version: PROTOCOL, session, type: "ready" });
  const send = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    if (latest) post(latest);
  };
  function message(event: MessageEvent<unknown>) {
    if (event.source !== window.uxpHost || event.origin !== PLUGIN_ID || !isHostMessage(event.data))
      return;
    const value = event.data;
    if (value.session !== session || value.revision <= revision || value.seq > seq) return;
    revision = value.revision;
    connected = true;
    for (const key of swatches) if (value.applied[key] >= dirty[key]) dirty[key] = 0;
    confirmed = Math.max(confirmed, value.committedSeq);
    if (value.seq === seq && value.error) change("error");
    else if (confirmed >= seq) change("idle");
    // Write acknowledgements never replace local RGB/HSV or the cursor.
    const acceptState =
      (value.reason === "initial" || value.reason === "external") &&
      value.seq === seq &&
      value.committedSeq >= seq &&
      !editing &&
      frame === null;
    receive(value.seq === seq ? value : { ...value, error: "" }, acceptState);
  }
  window.addEventListener("message", message);
  const retryTimer = window.setInterval(() => {
    if (!connected) {
      if (Date.now() - since >= 3000) change("delayed");
      ready();
      return;
    }
    if (!latest || confirmed >= seq || phase === "error") return;
    if (Date.now() - since >= 3000) {
      change("delayed");
      return;
    }
    // Idempotent resend recovers a dropped final packet/ack without replaying motions.
    send();
  }, 500);
  ready();
  return {
    command(command: Command, state: PickerState) {
      const color = command.kind === "hsv" || command.kind === "rgb";
      if (!editing && command.kind !== "finish") operation++;
      const final = !color || command.final;
      editing = !final;
      seq++;
      if (color) {
        dirty[state.active] = seq;
        if (state.linked) dirty[state.active === "fg" ? "bg" : "fg"] = seq;
      }
      latest = {
        channel: BRIDGE,
        version: PROTOCOL,
        session,
        type: "update",
        seq,
        operation,
        final,
        state,
        writes: { ...dirty },
      };
      since = Date.now();
      change("syncing");
      if (final) send();
      else if (frame === null) frame = requestAnimationFrame(send);
    },
    retry() {
      if (!latest) {
        ready();
        return;
      }
      latest = { ...latest, seq: ++seq, final: true };
      editing = false;
      since = Date.now();
      change("syncing");
      send();
    },
    dispose() {
      if (frame !== null) cancelAnimationFrame(frame);
      window.clearInterval(retryTimer);
      window.removeEventListener("message", message);
    },
  };
}
