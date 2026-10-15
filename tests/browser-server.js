const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../build/webview");
http
  .createServer((request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    const name = pathname === "/" ? "index.html" : pathname.slice(1);
    const target = path.resolve(root, name);
    if (
      !target.startsWith(root + path.sep) ||
      !fs.existsSync(target) ||
      !fs.statSync(target).isFile()
    ) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.setHeader(
      "Content-Type",
      path.extname(target) === ".js"
        ? "application/javascript"
        : path.extname(target) === ".css"
          ? "text/css"
          : "text/html",
    );
    response.end(fs.readFileSync(target));
  })
  .listen(4173, "127.0.0.1");
