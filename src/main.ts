import * as ps from "photoshop";
import { entrypoints } from "uxp";
import { createController } from "./bridge/controller.js";
import type { HostMessage } from "./bridge/protocol.js";

interface WebView extends HTMLElement {
  postMessage(message: HostMessage): void;
}
let view: WebView | null = null;
let pollTimer: number | null = null;
let installed = false;
let notificationInstalled = false;
let lastState: HostMessage | null = null;
function send(message: HostMessage) {
  lastState = message;
  try {
    view?.postMessage(message);
  } catch {
    /* The ready handshake resends after load. */
  }
}
const controller = createController(ps, send, localStorage);
function resize() {
  if (!view) return;
  const root = document.documentElement as unknown as HTMLElement;
  view.style.width = `${Math.max(1, window.innerWidth || root.clientWidth || 315)}px`;
  view.style.height = `${Math.max(1, window.innerHeight || root.clientHeight || 465)}px`;
}
function init() {
  if (installed) return;
  const element = document.getElementById("picker-webview");
  if (!element) return;
  installed = true;
  view = element as WebView;
  window.addEventListener("message", (event: BridgeEvent) => {
    // Only the bundled WebView may send commands to Photoshop.
    if (event.source === view) controller.receive(event.data);
  });
  view.addEventListener("loadstop", () => {
    const status = document.getElementById("load-status");
    if (status) status.textContent = "";
    if (lastState) send(lastState);
  });
  view.addEventListener("loaderror", () => {
    const status = document.getElementById("load-status");
    if (status)
      status.textContent = "Cannot load picker. Reload the plugin or check UXP WebView Support.";
  });
  window.addEventListener("resize", resize);
  if (typeof ResizeObserver === "function") new ResizeObserver(resize).observe(document.body);
  resize();
}
function show() {
  init();
  controller.show();
  if (pollTimer === null) pollTimer = setInterval(() => controller.poll(), 500);
  if (!notificationInstalled) {
    notificationInstalled = true;
    try {
      Promise.resolve(
        ps.action.addNotificationListener(["set", "exchange", "reset"], () => controller.poll()),
      ).catch(() => {
        notificationInstalled = false;
      });
    } catch {
      notificationInstalled = false;
    }
  }
}
function hide() {
  controller.hide();
  if (pollTimer !== null) clearInterval(pollTimer);
  pollTimer = null;
}
// Correct the SDK's array-only panel declaration at this one API boundary.
const setup = entrypoints.setup as unknown as (configuration: {
  panels: Record<string, { show(): void; hide(): void }>;
}) => void;
setup.call(entrypoints, { panels: { pickerPanel: { show, hide } } });
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", show);
else show();
