import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { clamp, fromHex, normalizedHue, rgbGradient, toHex } from "../src/color/conversions.js";
import type { Channel, HSV, Swatch } from "../src/color/types.js";
import { channels } from "../src/color/types.js";
import type { Command } from "../src/picker/model.js";
import { PickerModel } from "../src/picker/model.js";
import {
  constrainToDiamond,
  hsvToPoint,
  pickerRegion,
  pointToSv,
  scaledLayout,
} from "../src/ui/geometry.js";
import type { PickerRegion, Point } from "../src/ui/types.js";
import type { SyncPhase } from "./bridge.js";
import { createBridge } from "./bridge.js";
import { createCursorMotion } from "./cursor-motion.js";
import { drawPicker } from "./draw.js";

type Gesture = {
  pointer: number;
  rect: DOMRect;
  region: PickerRegion | Channel;
  element: HTMLElement;
};
export function App() {
  const model = useRef(new PickerModel());
  const [state, setState] = useState(model.current.snapshot());
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [syncPhase, setSyncPhase] = useState<SyncPhase>("idle");
  const [hexOpen, setHexOpen] = useState(false);
  const [hex, setHex] = useState("");
  const [hexError, setHexError] = useState("");
  const hexInput = useRef<HTMLInputElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const svMarker = useRef<HTMLDivElement>(null);
  const hueMarker = useRef<HTMLDivElement>(null);
  const motion = useRef<ReturnType<typeof createCursorMotion> | null>(null);
  // Pointer coordinates own the markers; color conversion never drives an active drag.
  const pointerPose = useRef<{ sv: Point | null; angle: number | null }>({ sv: null, angle: null });
  const gesture = useRef<Gesture | null>(null);
  const pendingPoint = useRef<Point | null>(null);
  const dragFrame = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const bridge = useRef<ReturnType<typeof createBridge> | null>(null);
  const [frame, setFrame] = useState(() => scaledLayout(window.innerWidth, window.innerHeight));
  const { dimension, railWidth, scale } = frame;
  const activeHsv = state.hsv[state.active];

  const command = useCallback((value: Command) => {
    if (value.kind !== "hsv" && value.kind !== "finish") {
      motion.current?.dispose();
      motion.current = null;
      pointerPose.current = { sv: null, angle: null };
    }
    model.current.apply(value);
    const snapshot = model.current.snapshot();
    setState(snapshot);
    setError("");
    bridge.current?.command(value, snapshot);
  }, []);
  const measure = useCallback(() => {
    if (gesture.current) return;
    setFrame(scaledLayout(window.innerWidth, window.innerHeight));
  }, []);
  const applyPoint = useCallback(
    (pos: Point) => {
      const region = gesture.current?.region;
      if (!region) return;
      const hsv: HSV = { ...model.current.state.hsv[model.current.state.active] };
      if (region === "ring") {
        if (Math.hypot(pos.x - 0.5, pos.y - 0.5) < 0.08) return;
        hsv.h = normalizedHue((Math.atan2(pos.x - 0.5, 0.5 - pos.y) * 180) / Math.PI + 45);
        command({ kind: "hsv", value: hsv, final: false });
      } else if (region === "diamond") {
        command({ kind: "hsv", value: { ...hsv, ...pointToSv(pos, hsv.s) }, final: false });
      } else {
        const rgb = { ...model.current.state.colors[model.current.state.active] };
        rgb[region] = Math.round(clamp(pos.x, 0, 1) * 255);
        command({ kind: "rgb", value: rgb, final: false });
      }
    },
    [command],
  );
  const flushPoint = useCallback(() => {
    if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
    dragFrame.current = null;
    const point = pendingPoint.current;
    pendingPoint.current = null;
    if (point) applyPoint(point);
  }, [applyPoint]);
  const finish = useCallback(() => {
    const current = gesture.current;
    if (!current) return;
    flushPoint();
    gesture.current = null;
    setDragging(false);
    if (current.element.hasPointerCapture(current.pointer))
      current.element.releasePointerCapture(current.pointer);
    bridge.current?.command({ kind: "finish" }, model.current.snapshot());
    measure();
  }, [measure, flushPoint]);
  const closeHex = useCallback(() => {
    hexInput.current?.blur();
    setHexOpen(false);
    setHexError("");
  }, []);
  useEffect(() => {
    bridge.current = createBridge((message, acceptState) => {
      setConnected(true);
      setError(message.error);
      if (!message.visible) {
        finish();
        closeHex();
      }
      // Only genuine idle host edits may replace local intent, never write echoes.
      if (acceptState && !gesture.current) {
        motion.current?.dispose();
        motion.current = null;
        pointerPose.current = { sv: null, angle: null };
        model.current.state = message.state;
        setState(model.current.snapshot());
      }
    }, setSyncPhase);
    return () => {
      motion.current?.dispose();
      if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
      bridge.current?.dispose();
      bridge.current = null;
    };
  }, [closeHex, finish]);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(measure);
    observer.observe(document.documentElement);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);
  useEffect(() => {
    if (canvas.current) drawPicker(canvas.current, dimension * scale, activeHsv.h);
  }, [dimension, scale, activeHsv.h]);
  useEffect(() => {
    const blur = () => {
      finish();
      closeHex();
    };
    window.addEventListener("blur", blur);
    return () => window.removeEventListener("blur", blur);
  }, [finish, closeHex]);
  useEffect(() => {
    if (hexOpen) {
      hexInput.current?.focus();
      hexInput.current?.select();
    }
  }, [hexOpen]);

  function move(event: ReactPointerEvent<HTMLElement>) {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    if (!(event.buttons & 1)) {
      finish();
      return;
    }
    event.preventDefault();
    const { rect } = current;
    pendingPoint.current = {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
    // Ease only the visual marker; color calculation keeps the exact pointer target.
    if (current.region === "diamond") {
      const point = constrainToDiamond(pendingPoint.current);
      pointerPose.current.sv = point;
      motion.current?.setSv(point);
    } else if (current.region === "ring") {
      const dx = pendingPoint.current.x - 0.5,
        dy = 0.5 - pendingPoint.current.y;
      if (Math.hypot(dx, dy) >= 0.08) {
        const angle = Math.atan2(dx, dy);
        pointerPose.current.angle = angle;
        motion.current?.setAngle(angle);
      }
    }
    if (dragFrame.current === null) dragFrame.current = requestAnimationFrame(flushPoint);
  }
  function start(event: ReactPointerEvent<HTMLElement>, channel?: Channel) {
    if (event.button !== 0 || !connected) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const region =
      channel ??
      pickerRegion({
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height,
      });
    if (!region) return;
    event.preventDefault();
    closeHex();
    const hsv = model.current.state.hsv[model.current.state.active];
    const initial = {
      sv: motion.current?.pose.sv ?? pointerPose.current.sv ?? hsvToPoint(hsv),
      angle:
        motion.current?.pose.angle ?? pointerPose.current.angle ?? ((hsv.h - 45) * Math.PI) / 180,
    };
    motion.current?.dispose();
    if (svMarker.current && hueMarker.current)
      motion.current = createCursorMotion(svMarker.current, hueMarker.current, initial);
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { pointer: event.pointerId, rect, region, element: event.currentTarget };
    setDragging(true);
    move(event);
    flushPoint();
  }
  function select(swatch: Swatch) {
    finish();
    closeHex();
    command({ kind: "select", swatch });
  }
  const pos = pointerPose.current.sv
    ? (motion.current?.pose.sv ?? pointerPose.current.sv)
    : hsvToPoint(activeHsv);
  const theta =
    pointerPose.current.angle !== null
      ? (motion.current?.pose.angle ?? pointerPose.current.angle)
      : ((activeHsv.h - 45) * Math.PI) / 180;
  const pointerHandlers = {
    onPointerMove: move,
    onPointerUp: finish,
    onPointerCancel: finish,
    onLostPointerCapture: finish,
  };
  return (
    <main
      className={`app${dragging ? " dragging" : ""}`}
      style={{
        width: frame.width,
        height: frame.height,
        fontSize: frame.fontSize,
        transform: `scale(${scale})`,
      }}
    >
      <header className="controlbar">
        <fieldset className="swatches" aria-label="Foreground and background colors">
          {(["bg", "fg"] as const).map((swatch) => (
            <button
              key={swatch}
              type="button"
              disabled={!connected}
              className={`swatch ${swatch} ${state.active === swatch ? "selected" : ""}`}
              aria-label={swatch === "fg" ? "Foreground color" : "Background color"}
              aria-pressed={state.active === swatch}
              style={{ backgroundColor: toHex(state.colors[swatch]) }}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => select(swatch)}
              onDoubleClick={() => {
                select(swatch);
                setHex(toHex(model.current.state.colors[swatch]));
                setHexOpen(true);
              }}
            />
          ))}
        </fieldset>
        <button
          type="button"
          className={`link ${state.linked ? "active" : ""}`}
          disabled={!connected}
          aria-label="Link foreground and background"
          aria-pressed={state.linked}
          title="Keep foreground/background HSB differences"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            finish();
            closeHex();
            command({ kind: "link", linked: !state.linked });
          }}
        >
          <svg
            viewBox="0 0 24 28"
            width="16"
            height="20"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          >
            <rect x="6" y="2" width="8" height="15" rx="4" transform="rotate(-25 10 9)" />
            <rect x="9" y="11" width="8" height="15" rx="4" transform="rotate(-25 13 18)" />
          </svg>
        </button>
        <section className="color-info" aria-label="Hue, saturation and brightness">
          <div>
            H <span>{Math.round(activeHsv.h)}°</span>
          </div>
          <div>
            S <span>{Math.round(activeHsv.s * 100)}%</span>
          </div>
          <div>
            B <span>{Math.round(activeHsv.v * 100)}%</span>
          </div>
        </section>
        {hexOpen && (
          <form
            className="hex-popup"
            onSubmit={(event) => {
              event.preventDefault();
              const rgb = fromHex(hex);
              if (!rgb) {
                setHexError("Enter six HEX digits");
                return;
              }
              command({ kind: "rgb", value: rgb, final: true });
              closeHex();
            }}
          >
            <label htmlFor="hex">HEX</label>
            <input
              id="hex"
              ref={hexInput}
              value={hex}
              maxLength={7}
              spellCheck={false}
              onChange={(event) => setHex(event.target.value)}
              aria-invalid={!!hexError}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeHex();
                }
              }}
            />
            <button type="button" aria-label="Close HEX editor" onClick={closeHex}>
              ×
            </button>
            {hexError && <span role="alert">{hexError}</span>}
          </form>
        )}
      </header>
      <div className="work-area">
        <div
          className="picker"
          data-testid="picker"
          style={{ width: dimension, height: dimension }}
        >
          <canvas ref={canvas} aria-label="Hue ring and saturation/brightness diamond" role="img" />
          <div
            className="picker-input"
            onPointerDown={(event) => start(event)}
            {...pointerHandlers}
          />
          <div
            ref={hueMarker}
            className="hue-cursor"
            style={{
              left: `${50 + Math.sin(theta) * 46}%`,
              top: `${50 - Math.cos(theta) * 46}%`,
              transform: `translate(-50%, -50%) rotate(${theta}rad)`,
            }}
          />
          <div
            ref={svMarker}
            className="sv-cursor"
            style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
          />
        </div>
        <section className="slider-area" aria-label="RGB sliders" style={{ width: railWidth }}>
          {channels.map((channel) => (
            <div className="slider-row" key={channel}>
              <span>{channel.toUpperCase()}</span>
              <div
                className="slider-track"
                data-testid={`track-${channel}`}
                style={{ backgroundImage: rgbGradient(state.colors[state.active], channel) }}
                onPointerDown={(event) => start(event, channel)}
                {...pointerHandlers}
              >
                <span
                  className="slider-marker"
                  style={{ left: `${(state.colors[state.active][channel] / 255) * 100}%` }}
                />
              </div>
              <output aria-label={`${channel.toUpperCase()} value`}>
                {state.colors[state.active][channel]}
              </output>
            </div>
          ))}
        </section>
      </div>
      <div className="status" role="status">
        {error ||
          (syncPhase === "delayed"
            ? "Sync delayed. Your color is kept."
            : syncPhase === "error"
              ? "Color sync failed. Your color is kept."
              : !connected
                ? "Connecting to Photoshop…"
                : "")}
        {(syncPhase === "delayed" || syncPhase === "error") && (
          <button type="button" onClick={() => bridge.current?.retry()}>
            Retry
          </button>
        )}
      </div>
    </main>
  );
}
