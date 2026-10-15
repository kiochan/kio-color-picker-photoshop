import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { clamp, fromHex, normalizedHue, rgbGradient, toHex } from "../src/color/conversions.js";
import type { Channel, HSV, Swatch } from "../src/color/types.js";
import { channels } from "../src/color/types.js";
import type { Command } from "../src/picker/model.js";
import { PickerModel } from "../src/picker/model.js";
import { hsvToPoint, layout, pickerRegion, pointToSv } from "../src/ui/geometry.js";
import type { PickerRegion } from "../src/ui/types.js";
import type { SyncPhase } from "./bridge.js";
import { createBridge } from "./bridge.js";
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
  const work = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const bridge = useRef<ReturnType<typeof createBridge> | null>(null);
  const [dimension, setDimension] = useState(180);
  const [railWidth, setRailWidth] = useState(192);
  const activeHsv = state.hsv[state.active];

  const command = useCallback((value: Command) => {
    model.current.apply(value);
    const snapshot = model.current.snapshot();
    setState(snapshot);
    setError("");
    bridge.current?.command(value, snapshot);
  }, []);
  const measure = useCallback(() => {
    if (gesture.current || !work.current) return;
    const box = work.current.getBoundingClientRect();
    const next = layout(box.width, box.height);
    setDimension(next.dimension);
    setRailWidth(next.railWidth);
  }, []);
  const finish = useCallback(() => {
    const current = gesture.current;
    if (!current) return;
    gesture.current = null;
    if (current.element.hasPointerCapture(current.pointer))
      current.element.releasePointerCapture(current.pointer);
    bridge.current?.command({ kind: "finish" }, model.current.snapshot());
    measure();
  }, [measure]);
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
      // Only idle host edits may replace local intent.
      if (acceptState && !gesture.current) {
        model.current.state = message.state;
        setState(model.current.snapshot());
      }
    }, setSyncPhase);
    return () => {
      bridge.current?.dispose();
      bridge.current = null;
    };
  }, [closeHex, finish]);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(measure);
    if (work.current) observer.observe(work.current);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);
  useEffect(() => {
    if (canvas.current) drawPicker(canvas.current, dimension, activeHsv.h);
  }, [dimension, activeHsv.h]);
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
    const { rect, region } = current;
    const pos = {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
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
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { pointer: event.pointerId, rect, region, element: event.currentTarget };
    move(event);
  }
  function select(swatch: Swatch) {
    finish();
    closeHex();
    command({ kind: "select", swatch });
  }
  const pos = hsvToPoint(activeHsv);
  const theta = ((activeHsv.h - 45) * Math.PI) / 180;
  const pointerHandlers = {
    onPointerMove: move,
    onPointerUp: finish,
    onPointerCancel: finish,
    onLostPointerCapture: finish,
  };
  return (
    <main className="app">
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
      <div className="work-area" ref={work}>
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
            className="hue-cursor"
            style={{ left: `${50 + Math.sin(theta) * 46}%`, top: `${50 - Math.cos(theta) * 46}%` }}
          />
          <div className="sv-cursor" style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }} />
          {dimension >= 195 && (
            <div className="color-info">
              HSB
              <br />
              H: {Math.round(activeHsv.h)}°<br />
              S: {Math.round(activeHsv.s * 100)}%<br />
              B: {Math.round(activeHsv.v * 100)}%
            </div>
          )}
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
