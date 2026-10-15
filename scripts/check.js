const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const runtime = [
  "LICENSE",
  "manifest.json",
  "index.html",
  "main.js",
  "styles.css",
  "build/main.js",
  "build/color/conversions.js",
  "build/color/state.js",
  "build/color/types.js",
  "build/ui/geometry.js",
  "build/ui/elements.js",
  "build/photoshop/color-sync.js",
  "assets/hue-ring.png",
  "assets/sv-white.png",
  "assets/sv-black.png",
  "assets/sv-matte.svg",
  "icons/panel.png",
  "icons/panel@2x.png",
  "icons/plugin.png",
  "icons/plugin@2x.png",
];
function check() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8")),
    pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  if (manifest.version !== pkg.version) throw Error("Version mismatch");
  if (
    manifest.manifestVersion !== 5 ||
    manifest.host.app !== "PS" ||
    manifest.host.data.apiVersion !== 2
  )
    throw Error("Unexpected UXP configuration");
  if (manifest.id !== "com.kiochan.colorpicker") throw Error("Unexpected plugin ID");
  for (const name of runtime) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) throw Error(`Missing ${name}`);
    if (name.endsWith(".js")) new vm.Script(fs.readFileSync(p, "utf8"), { filename: name });
  }
  if (!runtime.includes(manifest.main)) throw Error("Entry point not staged");
  for (const icon of [...manifest.icons, ...manifest.entrypoints[0].icons])
    for (const scale of icon.scale) {
      const p = icon.path.replace(/\.png$/, scale === 1 ? ".png" : `@${scale}x.png`),
        buf = fs.readFileSync(path.join(root, p));
      if (
        buf.readUInt32BE(16) !== icon.width * scale ||
        buf.readUInt32BE(20) !== icon.height * scale
      )
        throw Error(`Icon dimensions: ${p}`);
    }
  for (const match of fs
    .readFileSync(path.join(root, "index.html"), "utf8")
    .matchAll(/(?:src|href)="([^"]+)"/g))
    if (!runtime.includes(match[1])) throw Error(`HTML resource not staged: ${match[1]}`);
  for (const name of runtime.filter((n) => n.endsWith(".js")))
    for (const match of fs
      .readFileSync(path.join(root, name), "utf8")
      .matchAll(/require\(['"](\.[^'"]+)['"]\)/g)) {
      const p = path
        .relative(root, path.resolve(root, path.dirname(name), match[1]))
        .split(path.sep)
        .join("/");
      if (!runtime.includes(p)) throw Error(`Module not staged: ${p}`);
    }
  return { version: manifest.version, runtimeFiles: runtime.length };
}
module.exports = { check, runtime, root };
if (require.main === module) console.log(check());
