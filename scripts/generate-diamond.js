const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

/** @param {Buffer} bytes */
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
/** @param {string} type @param {Buffer} data */
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([size, body, crc]);
}
/**
 * Encode standard RGBA PNG without browser, SVG renderer, or external dependencies.
 * @param {number} size
 * @param {(x: number, y: number) => number[]} pixel
 */
function encodePng(size, pixel) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  const stride = 1 + size * 4;
  const pixels = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) pixels.set(pixel(x, y), y * stride + 1 + x * 4);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(pixels, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function generate() {
  const size = 1024;
  const assets = path.resolve(__dirname, "../assets");
  // Same diagonal axes as pointToSv. Pixel centers preserve mapping when scaled.
  // The existing solid SVG matte clips the square overlays to the fixed diamond.
  for (const layer of ["white", "black"]) {
    const png = encodePng(size, (x, y) => {
      const nx = (x + 0.5) / size;
      const ny = (y + 0.5) / size;
      const alpha = layer === "white" ? 1.5 - nx - ny : 0.5 + ny - nx;
      const value = layer === "white" ? 255 : 0;
      return [value, value, value, Math.round(255 * Math.max(0, Math.min(1, alpha)))];
    });
    fs.writeFileSync(path.join(assets, `sv-${layer}.png`), png);
  }
}
module.exports = { encodePng, generate };
if (require.main === module) generate();
