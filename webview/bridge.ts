import type { ClientMessage, HostMessage } from "../src/bridge/protocol.js";
import { BRIDGE, isHostMessage, PLUGIN_ID } from "../src/bridge/protocol.js";
import type { Command } from "../src/picker/model.js";

export function createBridge(receive: (message: HostMessage) => void) {
  const session =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let seq = 0;
  let connected = false;
  const send = (message: ClientMessage) => window.uxpHost?.postMessage(message);
  function ready() {
    send({ channel: BRIDGE, version: 1, session, type: "ready" });
  }
  function message(event: MessageEvent<unknown>) {
    if (event.source !== window.uxpHost || event.origin !== PLUGIN_ID || !isHostMessage(event.data))
      return;
    if (event.data.session !== session || event.data.seq < seq) return;
    connected = true;
    receive(event.data);
  }
  window.addEventListener("message", message);
  const retry = window.setInterval(() => {
    if (!connected) ready();
  }, 500);
  ready();
  return {
    command(command: Command) {
      send({ channel: BRIDGE, version: 1, session, type: "command", seq: ++seq, command });
    },
    dispose() {
      window.clearInterval(retry);
      window.removeEventListener("message", message);
    },
  };
}
