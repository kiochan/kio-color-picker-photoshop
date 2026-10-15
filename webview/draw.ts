import { hsvToRgb, toHex } from "../src/color/conversions.js";

// Clip and draw on one canvas so no rectangular color layer can leak.
export function drawPicker(canvas: HTMLCanvasElement, size: number, hue: number) {
  const pixels = Math.max(1, Math.round(size * Math.min(window.devicePixelRatio || 1, 3)));
  canvas.width = pixels;
  canvas.height = pixels;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("Canvas rendering is unavailable");
  context.scale(pixels, pixels);
  const ring = context.createConicGradient((-3 * Math.PI) / 4, 0.5, 0.5);
  for (let step = 0; step <= 6; step++)
    ring.addColorStop(step / 6, toHex(hsvToRgb(step * 60, 1, 1)));
  context.strokeStyle = ring;
  context.lineWidth = 0.08;
  context.beginPath();
  context.arc(0.5, 0.5, 0.46, 0, 2 * Math.PI);
  context.stroke();
  context.save();
  context.beginPath();
  context.moveTo(0.5, 0.12);
  context.lineTo(0.88, 0.5);
  context.lineTo(0.5, 0.88);
  context.lineTo(0.12, 0.5);
  context.closePath();
  context.clip();
  const pure = hsvToRgb(hue, 1, 1);
  // Horizontal saturation and vertical lightness, clipped to the same diamond
  // used by pointer mapping. One physical-pixel row keeps high-DPI edges smooth.
  for (let row = Math.floor(0.12 * pixels); row < Math.ceil(0.88 * pixels); row++) {
    const y = (row + 0.5) / pixels;
    const lightness = Math.max(0, Math.min(1, (0.88 - y) / 0.76));
    const span = 1 - Math.abs(2 * lightness - 1);
    if (span < 1e-12) continue;
    const gray = 255 * lightness;
    const saturated = [pure.r, pure.g, pure.b].map((value) => gray + span * (value - 127.5));
    const gradient = context.createLinearGradient(0.5 - span * 0.38, 0, 0.5 + span * 0.38, 0);
    gradient.addColorStop(0, `rgb(${gray},${gray},${gray})`);
    gradient.addColorStop(1, `rgb(${saturated.join(",")})`);
    context.fillStyle = gradient;
    context.fillRect(0.12, row / pixels, 0.76, 1 / pixels);
  }
  context.restore();
}
