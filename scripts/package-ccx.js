const fs = require("node:fs"),
  path = require("node:path");
const { check, root } = require("./check.js");
const packagerPath = path.join(
  root,
  ".adobe-cli/packages/uxp-devtools-core/src/core/client/plugin/actions/PluginPackageCommand.js",
);
// Call the pinned, unmodified Adobe packaging implementation. Do not load the
// CLI/service/desktop driver, whose native addons are unrelated to packaging.
// package() calls packageHost(), including Adobe's validateForPackaging checks.
// Photoshop-dependent strict manifest validation remains a separate host test.
/**
 * @typedef {{manifest: string, apps: string[], packageDir: string}} PackageParams
 * @typedef {{success: boolean, host?: string, error?: Error}} PackageResult
 * @typedef {new (manager: null, params: PackageParams) => {package(): Promise<PackageResult[]>}} PackageConstructor
 * @typedef {{existsSync(path: string): boolean, statSync(path: string): {size: number}}} PackageIO
 */
/**
 * @param {PackageConstructor} Packager
 * @param {PackageParams} params
 * @param {string} expected
 * @param {PackageIO} io
 */
async function packageWithAdobe(Packager, params, expected, io = fs) {
  if (io.existsSync(expected)) throw Error("Refusing stale CCX output: use a fresh CI checkout.");
  const command = new Packager(null, params);
  const results = await command.package();
  if (
    !Array.isArray(results) ||
    results.length !== 1 ||
    results[0].success !== true ||
    results[0].host !== "PS"
  ) {
    const messages = Array.isArray(results)
      ? results.map((r) => r.error?.message || "Unexpected packaging result").join("; ")
      : "No packaging results";
    throw Error(`Adobe packaging failed: ${messages}`);
  }
  if (!io.existsSync(expected) || io.statSync(expected).size === 0)
    throw Error("Adobe packager did not produce a CCX");
  return expected;
}
async function main() {
  const { version } = check();
  if (!fs.existsSync(packagerPath))
    throw Error("Pinned Adobe CLI source checkout is required; see docs/CI.md");
  const manifest = path.join(root, "dist", `kio-color-picker-${version}`, "manifest.json");
  if (!fs.existsSync(manifest)) throw Error("Run npm run stage first");
  const output = path.join(root, "dist/ccx");
  fs.mkdirSync(output, { recursive: true });
  const expected = path.join(output, "com.kiochan.colorpicker_PS.ccx");
  const Packager = require(packagerPath);
  console.log(
    "Using unmodified Adobe PluginPackageCommand.package(); no Photoshop host validation.",
  );
  await packageWithAdobe(Packager, { manifest, apps: ["PS"], packageDir: output }, expected);
  console.log("Adobe CCX created; content verification is the next required step.");
}
module.exports = { packageWithAdobe, main };
if (require.main === module) {
  const timeout = setTimeout(() => {
    console.error("Adobe packaging timed out");
    process.exit(1);
  }, 120000);
  main()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => clearTimeout(timeout));
}
