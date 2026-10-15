const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");
const { buildOptions } = require("./build-webview.js");
const root = path.resolve(__dirname, "..");
const out = path.join(root, ".dev");
async function main() {
  fs.mkdirSync(out, { recursive: true });
  const port = Number(process.env.PORT || 5173);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error("PORT must be between 1 and 65535");
  const options = buildOptions();
  const context = await esbuild.context({
    ...options,
    entryPoints: ["webview/dev.tsx"],
    outfile: path.join(out, "app.js"),
    minify: false,
    sourcemap: true,
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [
      {
        name: "preview-html",
        setup(build) {
          build.onStart(() => {
            const html = fs
              .readFileSync(path.join(root, "webview/index.html"), "utf8")
              .replace("connect-src 'none'", "connect-src 'self'")
              .replace(
                "<title>Kio Color Picker</title>",
                "<title>Kio Color Picker — Preview</title>",
              );
            fs.writeFileSync(path.join(out, "index.html"), html);
          });
          build.onLoad({ filter: /dev\.tsx$/ }, (args) => ({
            contents: fs.readFileSync(args.path, "utf8"),
            loader: "tsx",
            resolveDir: path.dirname(args.path),
            watchFiles: [path.join(root, "webview/index.html")],
          }));
        },
      },
    ],
  });
  try {
    await context.watch();
    const server = await context.serve({ servedir: out, host: "127.0.0.1", port });
    console.log(
      `\nKio Color Picker preview: http://127.0.0.1:${server.port}\nLocal simulated colors; Photoshop is not connected. Changes reload automatically.\nPress Ctrl+C to stop.\n`,
    );
    const stop = async () => {
      await context.dispose();
      process.exit();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  } catch (error) {
    await context.dispose();
    throw error;
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
