import type { Point } from "../src/ui/types.js";

export function createCursorMotion(
  sv: HTMLElement,
  hue: HTMLElement,
  initial: { sv: Point; angle: number },
) {
  const pose = { sv: { ...initial.sv }, angle: initial.angle };
  const target = { sv: { ...initial.sv }, angle: initial.angle };
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let frame: number | null = null;
  let previous = performance.now();
  const paint = () => {
    sv.style.left = `${pose.sv.x * 100}%`;
    sv.style.top = `${pose.sv.y * 100}%`;
    hue.style.left = `${50 + Math.sin(pose.angle) * 46}%`;
    hue.style.top = `${50 - Math.cos(pose.angle) * 46}%`;
    hue.style.transform = `translate(-50%, -50%) rotate(${pose.angle}rad)`;
  };
  const tick = (now: number) => {
    frame = null;
    // Time-based damping stays consistent at different refresh rates. No overshoot.
    const amount = reduced ? 1 : 1 - Math.exp(-Math.max(0, now - previous) / 24);
    previous = now;
    pose.sv.x += (target.sv.x - pose.sv.x) * amount;
    pose.sv.y += (target.sv.y - pose.sv.y) * amount;
    const angle = Math.atan2(
      Math.sin(target.angle - pose.angle),
      Math.cos(target.angle - pose.angle),
    );
    pose.angle += angle * amount;
    const settled =
      Math.hypot(target.sv.x - pose.sv.x, target.sv.y - pose.sv.y) < 0.0001 &&
      Math.abs(angle) < 0.0001;
    if (settled || reduced) {
      pose.sv = { ...target.sv };
      pose.angle = target.angle;
    }
    paint();
    if (!settled && !reduced) frame = requestAnimationFrame(tick);
  };
  const schedule = () => {
    if (frame !== null) return;
    previous = performance.now();
    if (reduced) tick(previous);
    else frame = requestAnimationFrame(tick);
  };
  return {
    pose,
    setSv(point: Point) {
      target.sv = { ...point };
      schedule();
    },
    setAngle(angle: number) {
      target.angle = angle;
      schedule();
    },
    dispose() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    },
  };
}
