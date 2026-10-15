const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
function element() {
  return {
    style: {},
    textContent: "",
    listeners: {},
    addEventListener(name, callback) {
      this.listeners[name] = callback;
    },
  };
}
const view = element(),
  status = element(),
  body = element();
const messages = [],
  listeners = {},
  intervals = new Map(),
  storage = new Map();
view.postMessage = (message) => messages.push(message);
const document = {
  body,
  readyState: "loading",
  documentElement: { clientWidth: 310, clientHeight: 455 },
  getElementById: (id) => (id === "picker-webview" ? view : status),
  addEventListener: (name, callback) => {
    listeners[name] = callback;
  },
};
const window = {
  innerWidth: 0,
  innerHeight: 0,
  addEventListener: (name, callback) => {
    listeners[name] = callback;
  },
};
let panel,
  notificationCount = 0;
class SolidColor {
  constructor() {
    this.rgb = { red: 30, green: 60, blue: 90 };
  }
}
const photoshop = {
  app: { SolidColor, foregroundColor: new SolidColor(), backgroundColor: new SolidColor() },
  core: { executeAsModal: async (fn) => fn() },
  action: {
    addNotificationListener() {
      notificationCount++;
    },
  },
};
const context = vm.createContext({
  document,
  window,
  console,
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  },
  setTimeout,
  clearTimeout,
  setInterval: (callback) => {
    intervals.set(1, callback);
    return 1;
  },
  clearInterval: (id) => intervals.delete(id),
  ResizeObserver: class {
    observe() {}
  },
});
const modules = new Map();
function load(file) {
  if (modules.has(file)) return modules.get(file).exports;
  const module = { exports: {} };
  modules.set(file, module);
  const requireLocal = (name) => {
    if (name === "photoshop") return photoshop;
    if (name === "uxp")
      return {
        entrypoints: {
          setup(config) {
            panel = config.panels.pickerPanel;
          },
        },
      };
    return load(path.resolve(path.dirname(file), name));
  };
  const run = vm.runInContext(
    `(function(require,module,exports){${fs.readFileSync(file, "utf8")}\n})`,
    context,
  );
  run(requireLocal, module, module.exports);
  return module.exports;
}
load(path.resolve(__dirname, "../main.js"));
assert.equal(view.style.width, undefined, "Wait for the UXP DOM");
listeners.DOMContentLoaded();
assert.equal(view.style.width, "310px");
assert.equal(view.style.height, "455px");
assert.equal(intervals.size, 1);
const ready = { channel: "kio-color-picker", version: 2, session: "shell-test", type: "ready" };
listeners.message({ source: {}, data: ready });
assert.equal(messages.length, 0, "Reject other message sources");
listeners.message({ source: view, data: ready });
assert.equal(messages.at(-1).session, "shell-test");
assert.equal(messages.at(-1).visible, true);
listeners.message({
  source: view,
  data: {
    ...ready,
    type: "update",
    seq: 1,
    operation: 1,
    final: true,
    writes: { fg: 0, bg: 0 },
    state: { ...messages.at(-1).state, linked: true },
  },
});
assert.equal(storage.get("kio.linked"), "true");
panel.hide();
assert.equal(intervals.size, 0);
assert.equal(messages.at(-1).visible, false);
panel.show();
panel.show();
assert.equal(notificationCount, 1);
assert.equal(intervals.size, 1);
window.innerWidth = 420;
window.innerHeight = 520;
listeners.resize();
assert.equal(view.style.width, "420px");
assert.equal(view.style.height, "520px");
view.listeners.loaderror();
assert.match(status.textContent, /WebView Support/);
view.listeners.loadstop();
assert.equal(status.textContent, "");
panel.hide();
console.log(
  "PASS real UXP root loader, WebView source filtering, resize fallback, lifecycle, storage and load errors",
);
