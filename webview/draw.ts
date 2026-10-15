import { hsvToRgb, toHex } from "../src/color/conversions.js";
import { diamondTone } from "../src/ui/geometry.js";

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
  const surface = document.createElement("canvas");
  surface.width = pixels;
  surface.height = pixels;
  const surfaceContext = surface.getContext("2d");
  if (!surfaceContext) throw new Error("Canvas rendering is unavailable");
  const image = surfaceContext.createImageData(pixels, pixels);
  // Use the same continuous surface as hit testing, at physical-pixel resolution.
  // Clip the composite to retain antialiased edges without colored seams.
  for (let row = Math.floor(0.12 * pixels); row < Math.ceil(0.88 * pixels); row++) {
    const y = (row + 0.5) / pixels;
    for (let column = Math.floor(0.12 * pixels); column < Math.ceil(0.88 * pixels); column++) {
      const { white, chroma } = diamondTone({ x: (column + 0.5) / pixels, y });
      const offset = (row * pixels + column) * 4;
      image.data[offset] = Math.round(255 * white + pure.r * chroma);
      image.data[offset + 1] = Math.round(255 * white + pure.g * chroma);
      image.data[offset + 2] = Math.round(255 * white + pure.b * chroma);
      image.data[offset + 3] = 255;
    }
  }
  surfaceContext.putImageData(image, 0, 0);
  context.drawImage(surface, 0, 0, 1, 1);
  context.restore();
}
