const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const out = path.join(root, "build/webview");
fs.mkdirSync(out, { recursive: true });
function html() {
  fs.copyFileSync(path.join(root, "webview/index.html"), path.join(out, "index.html"));
  const notices = ["react", "react-dom"].map(
    (name) =>
      `${name}\n${fs.readFileSync(path.join(root, "node_modules", name, "LICENSE"), "utf8")}`,
  );
  fs.writeFileSync(path.join(out, "THIRD_PARTY_LICENSES.txt"), notices.join("\n\n"));
}
function buildOptions() {
  return {
    absWorkingDir: root,
    tsconfig: "tsconfig.webview.json",
    entryPoints: ["webview/main.tsx"],
    outfile: "build/webview/app.js",
    bundle: true,
    minify: true,
    target: ["chrome100", "safari15.4"],
    format: /** @type {const} */ ("iife"),
    legalComments: /** @type {const} */ ("linked"),
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "local-html",
        setup(/** @type {import('esbuild').PluginBuild} */ build) {
          build.onStart(html);
          build.onLoad({ filter: /main\.tsx$/ }, (args) => ({
            contents: fs.readFileSync(args.path, "utf8"),
            loader: "tsx",
            resolveDir: path.dirname(args.path),
            watchFiles: [path.join(root, "webview/index.html")],
          }));
        },
      },
    ],
  };
}
async function main() {
  const options = buildOptions();
  if (process.argv.includes("--watch")) {
    const compiler = spawn(
      process.execPath,
      [
        path.join(path.dirname(require.resolve("typescript/package.json")), "bin/tsc"),
        "-p",
        "tsconfig.json",
        "--watch",
      ],
      { cwd: root, stdio: "inherit" },
    );
    const context = await esbuild.context(options);
    await context.watch();
    const stop = async () => {
      compiler.kill();
      await context.dispose();
      process.exit();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    compiler.on("exit", stop);
    console.log("Watching UXP TypeScript and local React WebView assets.");
  } else await esbuild.build(options);
}
module.exports = { buildOptions };
if (require.main === module)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
