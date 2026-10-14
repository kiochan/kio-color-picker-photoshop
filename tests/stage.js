const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { check, runtime, root } = require("../scripts/check.js");

// Inspect the real UDT staging output, including compiled modules and their hashes.
const { version } = check();
const stage = path.join(root, "dist", `kio-color-picker-${version}`);
function filesAt(directory, prefix = "") {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix + entry.name;
    return entry.isDirectory()
      ? filesAt(path.join(directory, entry.name), `${relative}/`)
      : [relative];
  });
}
assert.deepEqual(filesAt(stage).sort(), [...runtime].sort());
const hashes = JSON.parse(
  fs.readFileSync(path.join(root, "dist", `kio-color-picker-${version}-sha256.json`), "utf8"),
);
assert.deepEqual(hashes.map((item) => item.file).sort(), [...runtime].sort());
for (const { file, sha256 } of hashes) {
  const staged = fs.readFileSync(path.join(stage, file));
  assert.ok(staged.equals(fs.readFileSync(path.join(root, file))), `Stage differs: ${file}`);
  assert.equal(crypto.createHash("sha256").update(staged).digest("hex"), sha256);
  assert.ok(!file.endsWith(".ts") && !file.includes("node_modules"));
}
assert.match(
  fs.readFileSync(path.join(stage, "main.js"), "utf8"),
  /require\("\.\/build\/main\.js"\)/,
);
console.log(`Staged ${runtime.length} runtime files match compiled output and SHA-256 records`);
