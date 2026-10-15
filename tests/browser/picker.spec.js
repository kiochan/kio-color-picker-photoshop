const { test, expect } = require("@playwright/test");
const { hsvToRgb } = require("../../build/color/conversions.js");
const { hsvToPoint } = require("../../build/ui/geometry.js");
const { createController } = require("../../build/bridge/controller.js");
const { PickerModel } = require("../../build/picker/model.js");

test("100–300ms bidirectional jitter does not move the final color after rapid swatch edits", async ({
  page,
}) => {
  class SolidColor {
    constructor() {
      this.rgb = { red: 36, green: 179, blue: 36 };
    }
  }
  const host = {
    app: { SolidColor, foregroundColor: new SolidColor(), backgroundColor: new SolidColor() },
    core: {
      executeAsModal: async (fn) => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return fn();
      },
    },
  };
  const tasks = [],
    commands = [];
  let serial = 0;
  const later = (fn, delay) =>
    tasks.push(
      new Promise((resolve, reject) =>
        setTimeout(() => {
          Promise.resolve().then(fn).then(resolve, reject);
        }, delay),
      ),
    );
  const controller = createController(
    host,
    (message) => {
      later(
        () =>
          page.evaluate((value) => window.deliver(value), {
            ...message,
            revision: message.revision + 1000,
          }),
        100 + ((++serial * 73) % 201),
      );
    },
    { getItem: () => null, setItem() {} },
  );
  controller.show();
  const session = await page.evaluate(() => window.session);
  controller.receive({ channel: "kio-color-picker", version: 2, session, type: "ready" });
  await Promise.all(tasks);
  const expected = new PickerModel();
  expected.state = controller.model.snapshot();
  await page.exposeFunction("delayedHost", (message) => {
    commands.push(message);
    later(() => controller.receive(message), 100 + ((message.seq * 137) % 201));
  });
  await page.evaluate(() => {
    window.uxpHost.postMessage = (message) => {
      void window.delayedHost(message);
    };
  });
  for (const [swatch, channel, ratio] of [
    ["Foreground color", "r", 0.9],
    ["Background color", "g", 0.25],
  ]) {
    await page.getByRole("button", { name: swatch, exact: true }).click();
    const box = await page.getByTestId(`track-${channel}`).boundingBox();
    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * ratio, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
  }
  await page.getByRole("button", { name: "Foreground color", exact: true }).click();
  const final = await page.getByLabel("R value").textContent();
  await page.evaluate(() => {
    window.outputHistory = [];
    new MutationObserver(() =>
      window.outputHistory.push(document.querySelector('[aria-label="R value"]').textContent),
    ).observe(document.querySelector('[aria-label="R value"]'), {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
  // Wait until command timers, modal writes, and new response timers all drain.
  for (let size = -1; size !== tasks.length; ) {
    size = tasks.length;
    await Promise.all(tasks);
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
  for (let size = -1; size !== tasks.length; ) {
    size = tasks.length;
    await Promise.all(tasks);
  }
  expected.state = commands.sort((a, b) => a.seq - b.seq).at(-1).state;
  expect(commands.length).toBeGreaterThan(10);
  expect(controller.model.snapshot()).toEqual(expected.snapshot());
  expect(host.app.foregroundColor.rgb).toEqual({
    red: expected.state.colors.fg.r,
    green: expected.state.colors.fg.g,
    blue: expected.state.colors.fg.b,
  });
  expect(host.app.backgroundColor.rgb).toEqual({
    red: expected.state.colors.bg.r,
    green: expected.state.colors.bg.g,
    blue: expected.state.colors.bg.b,
  });
  await expect(page.getByLabel("R value")).toHaveText(final);
  expect(
    await page.evaluate(() =>
      window.outputHistory.every(
        (value) => value === document.querySelector('[aria-label="R value"]').textContent,
      ),
    ),
  ).toBe(true);
});

test("uncommitted echoes and sync timeout preserve color and cursor; Retry confirms the same target", async ({
  page,
}) => {
  await page.evaluate(() => {
    window.holdReplies = true;
  });
  await page.getByRole("button", { name: "Foreground color", exact: true }).dblclick();
  await page.getByLabel("HEX", { exact: true }).fill("#D62828");
  await page.getByLabel("HEX", { exact: true }).press("Enter");
  const cursor = await page.locator(".sv-cursor").getAttribute("style");
  const box = await page.getByTestId("picker").boundingBox();
  const seq = await page.evaluate(() => {
    const value = window.commands.at(-1);
    const wrong = structuredClone(value.state);
    wrong.colors.fg = { r: 0, g: 0, b: 255 };
    wrong.hsv.fg = { h: 240, s: 1, v: 1 };
    window.deliver({
      ...value,
      type: "state",
      committedSeq: 0,
      applied: { fg: 0, bg: 0 },
      reason: "ack",
      state: wrong,
      error: "",
      visible: true,
    });
    return value.seq;
  });
  await expect(page.getByLabel("R value")).toHaveText("214");
  expect(await page.locator(".sv-cursor").getAttribute("style")).toBe(cursor);
  await expect(page.locator(".status")).toContainText("Sync delayed", { timeout: 6000 });
  await expect(page.getByLabel("R value")).toHaveText("214");
  expect(await page.getByTestId("picker").boundingBox()).toEqual(box);
  expect(await page.locator(".sv-cursor").getAttribute("style")).toBe(cursor);
  await page.evaluate(() => {
    window.holdReplies = false;
  });
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator(".status")).toBeEmpty();
  const retry = await page.evaluate(() => window.commands.at(-1));
  expect(retry.seq).toBeGreaterThan(seq);
  expect(retry.final).toBe(true);
  expect(retry.state.colors.fg).toEqual({ r: 214, g: 40, b: 40 });
  expect(await page.locator(".sv-cursor").getAttribute("style")).toBe(cursor);
});

test("successful color-managed echoes cannot move the cursor; only idle external edits can", async ({
  page,
}) => {
  await page.evaluate(() => {
    window.holdReplies = true;
  });
  const box = await page.getByTestId("picker").boundingBox();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.up();
  await expect
    .poll(async () =>
      page
        .locator(".sv-cursor")
        .evaluate((element) => Math.abs(Number.parseFloat(element.style.top) - 50)),
    )
    .toBeLessThan(0.00001);
  const cursor = await page.locator(".sv-cursor").getAttribute("style");
  const rgb = await page.getByLabel("R value").textContent();
  await page.evaluate(() => {
    const final = window.commands.at(-1);
    const corrected = structuredClone(final.state);
    corrected.colors.fg = { r: 1, g: 2, b: 3 };
    corrected.hsv.fg = { h: 240, s: 0.8, v: 0.1 };
    window.deliver({
      ...final,
      type: "state",
      committedSeq: final.seq,
      applied: final.writes,
      reason: "ack",
      state: corrected,
      error: "",
      visible: true,
    });
  });
  await expect(page.getByLabel("R value")).toHaveText(rgb);
  expect(await page.locator(".sv-cursor").getAttribute("style")).toBe(cursor);
  await page.evaluate(() => {
    const final = window.commands.at(-1);
    const external = structuredClone(final.state);
    external.colors.fg = { r: 255, g: 0, b: 0 };
    external.hsv.fg = { h: 0, s: 1, v: 1 };
    window.deliver({
      ...final,
      type: "state",
      committedSeq: final.seq,
      applied: final.writes,
      reason: "external",
      state: external,
      error: "",
      visible: true,
    });
  });
  await expect(page.getByLabel("R value")).toHaveText("255");
  expect(await page.locator(".sv-cursor").getAttribute("style")).not.toBe(cursor);
});

test("a lost final packet is resent as the complete target without replaying intermediate colors", async ({
  page,
}) => {
  await page.evaluate(() => {
    const send = window.uxpHost.postMessage;
    window.uxpHost.postMessage = (message) => {
      if (message.type === "update" && message.final && !window.droppedFinal) {
        window.droppedFinal = message;
        return;
      }
      send(message);
    };
  });
  await page.getByRole("button", { name: "Foreground color", exact: true }).dblclick();
  // Swatch selection is also a final snapshot; discard only the color commit.
  await page.evaluate(() => {
    window.droppedFinal = null;
  });
  await page.getByLabel("HEX", { exact: true }).fill("#E71122");
  await page.getByLabel("HEX", { exact: true }).press("Enter");
  const dropped = await page.evaluate(() => window.droppedFinal);
  expect(dropped.state.colors.fg).toEqual({ r: 231, g: 17, b: 34 });
  await expect(page.getByLabel("R value")).toHaveText("231");
  await expect.poll(() => page.evaluate(() => window.commands.at(-1)?.seq)).toBe(dropped.seq);
  await expect(page.locator(".status")).toBeEmpty();
  const resent = await page.evaluate(() => window.commands.at(-1));
  expect(resent.seq).toBe(dropped.seq);
  expect(resent.state).toEqual(dropped.state);
  await expect(page.getByLabel("R value")).toHaveText("231");
});

test("transport exceptions preserve the selected color and allow explicit retry", async ({
  page,
}) => {
  await page.evaluate(() => {
    const send = window.uxpHost.postMessage;
    window.transportBroken = true;
    window.uxpHost.postMessage = (value) => {
      if (window.transportBroken) throw new Error("WebView transport unavailable");
      send(value);
    };
  });
  await page.getByRole("button", { name: "Foreground color", exact: true }).dblclick();
  await page.getByLabel("HEX", { exact: true }).fill("#102030");
  await page.getByLabel("HEX", { exact: true }).press("Enter");
  await expect(page.getByLabel("R value")).toHaveText("16");
  await expect(page.locator(".status")).toContainText("Sync delayed");
  await page.evaluate(() => {
    document.querySelector(".status button").addEventListener(
      "click",
      () => {
        window.transportBroken = false;
      },
      { capture: true, once: true },
    );
  });
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator(".status")).toBeEmpty();
  await expect(page.getByLabel("B value")).toHaveText("48");
});

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("close", () => expect(errors).toEqual([]));
  await page.addInitScript(() => {
    window.commands = [];
    window.hostRevision = 0;
    window.hostState = {
      colors: { fg: { r: 36, g: 179, b: 36 }, bg: { r: 153, g: 43, b: 31 } },
      hsv: { fg: { h: 120, s: 0.8, v: 0.7 }, bg: { h: 6, s: 0.8, v: 0.6 } },
      active: "fg",
      linked: false,
      relative: { h: 0, s: 0, v: 0 },
    };
    window.deliver = (message, origin = "com.kiochan.colorpicker", source = window.uxpHost) => {
      message = {
        committedSeq: message.seq,
        operation: 0,
        applied: { fg: 0, bg: 0 },
        reason: message.visible === false ? "lifecycle" : "external",
        ...message,
      };
      if (message.revision === undefined) message = { ...message, revision: ++window.hostRevision };
      else window.hostRevision = Math.max(window.hostRevision, message.revision);
      const event = new Event("message");
      Object.defineProperties(event, {
        source: { value: source },
        origin: { value: origin },
        data: { value: message },
      });
      window.dispatchEvent(event);
    };
    window.uxpHost = {
      postMessage(message) {
        if (message.type === "ready") {
          window.session = message.session;
          setTimeout(
            () =>
              window.deliver({
                ...message,
                type: "state",
                seq: 0,
                state: window.hostState,
                error: "",
                visible: true,
              }),
            0,
          );
        } else {
          window.commands.push(message);
          if (!window.holdReplies)
            setTimeout(
              () =>
                window.deliver({
                  ...message,
                  type: "state",
                  committedSeq: message.seq,
                  applied: message.writes,
                  reason: "ack",
                  error: "",
                  visible: true,
                }),
              0,
            );
        }
      },
    };
  });
  await page.goto("/");
  await expect(page.locator(".status")).toBeEmpty();
});

test("late snapshots with the same command number never restore an older color", async ({
  page,
}) => {
  await page.evaluate(() => {
    const packet = {
      channel: "kio-color-picker",
      version: 2,
      session: window.session,
      type: "state",
      seq: 0,
      error: "",
      visible: true,
    };
    const older = structuredClone(window.hostState);
    const newer = structuredClone(window.hostState);
    newer.colors.fg = { r: 255, g: 0, b: 0 };
    newer.hsv.fg = { h: 0, s: 1, v: 1 };
    window.deliver({ ...packet, revision: 200, state: newer });
    setTimeout(() => window.deliver({ ...packet, revision: 199, state: older }), 100);
  });
  await expect(page.getByLabel("R value")).toHaveText("255");
  await page.waitForTimeout(200);
  await expect(page.getByLabel("R value")).toHaveText("255");
});

test("pointer cancellation and host hide terminate gestures and close the HEX editor", async ({
  page,
}) => {
  const picker = await page.getByTestId("picker").boundingBox();
  await page.mouse.move(picker.x + picker.width * 0.5, picker.y + picker.height * 0.3);
  await page.mouse.down();
  await page.locator(".picker-input").dispatchEvent("pointercancel");
  await expect.poll(() => page.evaluate(() => window.commands.at(-1)?.final)).toBe(true);
  await page.mouse.up();
  await page.getByRole("button", { name: "Foreground color", exact: true }).dblclick();
  await expect(page.getByLabel("HEX", { exact: true })).toBeFocused();
  await page.evaluate(() =>
    window.deliver({
      channel: "kio-color-picker",
      version: 2,
      session: window.session,
      type: "state",
      seq: window.commands.at(-1)?.seq ?? 0,
      state: window.hostState,
      error: "",
      visible: false,
    }),
  );
  await expect(page.getByLabel("HEX", { exact: true })).toHaveCount(0);
});

test("responsive vertical layout remains centered across panel sizes", async ({ page }) => {
  for (const [width, height] of [
    [205, 290],
    [310, 455],
    [360, 480],
    [1000, 290],
    [205, 1400],
    [2200, 2200],
  ]) {
    await page.setViewportSize({ width, height });
    const scale = Math.min(width / 360, height / 480);
    const fontSize = Math.max(12, 12 / scale);
    const extraRows = Math.max(20, fontSize * 1.8) * 3 - 60;
    const dimension = Math.floor(
      Math.min(width / scale - 26, height / scale - 149 - extraRows, 480),
    );
    await expect
      .poll(async () => {
        const picker = await page.getByTestId("picker").boundingBox();
        return picker.width;
      })
      .toBeCloseTo(dimension * scale, 2);
    const picker = await page.getByTestId("picker").boundingBox();
    const sliders = await page.getByRole("region", { name: "RGB sliders" }).boundingBox();
    expect(Math.abs(picker.x + picker.width / 2 - width / 2)).toBeLessThan(1);
    expect(Math.abs(sliders.x + sliders.width / 2 - width / 2)).toBeLessThan(1);
    expect(picker.width).toBeCloseTo(picker.height, 3);
    expect(sliders.y).toBeGreaterThanOrEqual(picker.y + picker.height);
    expect(sliders.y + sliders.height).toBeLessThanOrEqual(height);
    const fonts = await page
      .locator(".color-info, .slider-row > span, .slider-row output, .status")
      .evaluateAll((elements) =>
        elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
      );
    for (const size of fonts) {
      expect(size).toBeCloseTo(fontSize, 2);
      expect(size * scale).toBeGreaterThanOrEqual(11.99);
    }
    const cursor = await page.locator(".sv-cursor").boundingBox();
    const swatch = await page
      .getByRole("button", { name: "Foreground color", exact: true })
      .boundingBox();
    expect(cursor.width).toBeCloseTo(16 * scale, 2);
    expect(swatch.width).toBeCloseTo(33 * scale, 2);
    const target = { x: picker.x + picker.width * 0.58, y: picker.y + picker.height * 0.48 };
    await page.mouse.click(target.x, target.y);
    await expect
      .poll(async () => {
        const selected = await page.locator(".sv-cursor").boundingBox();
        return Math.hypot(
          selected.x + selected.width / 2 - target.x,
          selected.y + selected.height / 2 - target.y,
        );
      })
      .toBeLessThan(1);
  }
});

test("actual canvas pixels match HSV, including the previously black diamond and right-hand seam", async ({
  page,
}) => {
  for (const hue of [0, 120, 241]) {
    await page.evaluate((h) => {
      window.hostState.hsv.fg.h = h;
      window.deliver({
        channel: "kio-color-picker",
        version: 2,
        session: window.session,
        type: "state",
        seq: 0,
        state: window.hostState,
        error: "",
        visible: true,
      });
    }, hue);
    await page.waitForTimeout(50);
    // Avoid subpixel-distance samples at the collapsed white/black tips.
    for (const s of [0.15, 0.35, 0.65, 0.85])
      for (const v of [0.2, 0.45, 0.7, 0.9]) {
        const point = hsvToPoint({ s, v });
        const actual = await page.locator("canvas").evaluate((canvas, p) => {
          const x = Math.floor(p.x * canvas.width),
            y = Math.floor(p.y * canvas.height);
          return [...canvas.getContext("2d").getImageData(x, y, 1, 1).data];
        }, point);
        const expected = hsvToRgb(hue, s, v);
        for (const [i, channel] of ["r", "g", "b"].entries())
          expect(Math.abs(actual[i] - expected[channel])).toBeLessThanOrEqual(3);
        expect(actual[3]).toBe(255);
      }
    for (const [point, expected] of [
      [
        { x: 0.5, y: 0.13 },
        { r: 255, g: 255, b: 255 },
      ],
      [
        { x: 0.13, y: 0.5 },
        { r: 128, g: 128, b: 128 },
      ],
      [{ x: 0.87, y: 0.5 }, hsvToRgb(hue, 1, 1)],
      [
        { x: 0.5, y: 0.87 },
        { r: 0, g: 0, b: 0 },
      ],
    ]) {
      const actual = await page
        .locator("canvas")
        .evaluate(
          (canvas, p) => [
            ...canvas
              .getContext("2d")
              .getImageData(Math.floor(p.x * canvas.width), Math.floor(p.y * canvas.height), 1, 1)
              .data,
          ],
          point,
        );
      for (const [i, channel] of ["r", "g", "b"].entries())
        expect(Math.abs(actual[i] - expected[channel])).toBeLessThanOrEqual(7);
      expect(actual[3]).toBe(255);
    }
    const alphas = await page.locator("canvas").evaluate((canvas) => {
      const ctx = canvas.getContext("2d"),
        result = [];
      for (let y = 0.15; y <= 0.85; y += 0.025) {
        const x = 0.882;
        // Exclude the legitimate antialiased right vertex, not the vertical gap.
        if (Math.abs(y - 0.5) < 0.02) continue;
        if (Math.hypot(x - 0.5, y - 0.5) >= 0.415) continue;
        result.push(
          ctx.getImageData(Math.floor(x * canvas.width), Math.floor(y * canvas.height), 1, 1)
            .data[3],
        );
      }
      return result;
    });
    expect(alphas.length).toBeGreaterThan(5);
    expect(alphas.every((value) => value === 0)).toBe(true);
  }
});

test("pointer capture, frozen resize coordinates, cancellation, and final flush", async ({
  page,
}) => {
  const picker = await page.getByTestId("picker").boundingBox();
  await page.mouse.move(picker.x + picker.width * 0.5, picker.y + picker.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(picker.x + picker.width * 0.7, picker.y + picker.height * 0.5, {
    steps: 12,
  });
  await page.setViewportSize({ width: 420, height: 520 });
  expect((await page.getByTestId("picker").boundingBox()).width).toBe(picker.width);
  await page.mouse.move(419, 519);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.commands.at(-1)?.final)).toBe(true);
  const count = await page.evaluate(() => window.commands.length);
  await page.mouse.move(200, 200);
  expect(await page.evaluate(() => window.commands.length)).toBe(count);
  await expect
    .poll(async () => (await page.getByTestId("picker").boundingBox()).width)
    .not.toBe(picker.width);
});

test("dense pointer bursts keep only the newest position and remain still after release", async ({
  page,
}) => {
  await page.setViewportSize({ width: 310, height: 455 });
  await expect
    .poll(async () => (await page.getByTestId("picker").boundingBox()).width)
    .toBeLessThan(310);
  for (const region of ["diamond", "ring"]) {
    const box = await page.getByTestId("picker").boundingBox();
    await page.mouse.move(
      box.x + box.width * 0.5,
      box.y + box.height * (region === "ring" ? 0.04 : 0.5),
    );
    await page.mouse.down();
    await expect(page.locator(".app")).toHaveClass(/dragging/);
    const target = await page.locator(".picker-input").evaluate((element, kind) => {
      const rect = element.getBoundingClientRect();
      let point;
      let maxError = 0;
      for (let i = 0; i < 200; i++) {
        const t = i / 199;
        point =
          kind === "ring"
            ? { x: 0.5 + Math.sin(t * 1.2) * 0.46, y: 0.5 - Math.cos(t * 1.2) * 0.46 }
            : { x: 0.3 + t * 0.4, y: 0.5 };
        element.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            pointerId: 1,
            buttons: 1,
            clientX: rect.left + point.x * rect.width,
            clientY: rect.top + point.y * rect.height,
          }),
        );
        // The visual pose stays fixed within this input burst; colors can still
        // take the exact newest target without waiting for the easing animation.
        const marker = element.parentElement.querySelector(
          kind === "ring" ? ".hue-cursor" : ".sv-cursor",
        );
        const bounds = marker.getBoundingClientRect();
        maxError = Math.max(
          maxError,
          Math.hypot(
            bounds.left + bounds.width / 2 - (rect.left + point.x * rect.width),
            bounds.top + bounds.height / 2 - (rect.top + point.y * rect.height),
          ),
        );
      }
      return { x: rect.left + point.x * rect.width, y: rect.top + point.y * rect.height, maxError };
    }, region);
    expect(target.maxError).toBeGreaterThan(1);
    await page.mouse.up();
    await expect(page.locator(".app")).not.toHaveClass(/dragging/);
    const marker = page.locator(region === "ring" ? ".hue-cursor" : ".sv-cursor");
    await page.waitForTimeout(250);
    await expect
      .poll(async () => {
        const bounds = await marker.boundingBox();
        return Math.hypot(
          bounds.x + bounds.width / 2 - target.x,
          bounds.y + bounds.height / 2 - target.y,
        );
      })
      .toBeLessThan(0.02);
    const position = await marker.boundingBox();
    expect(
      Math.hypot(
        position.x + position.width / 2 - target.x,
        position.y + position.height / 2 - target.y,
      ),
    ).toBeLessThan(1);
    await page.waitForTimeout(600);
    expect(await marker.boundingBox()).toEqual(position);
    expect(await page.evaluate(() => window.commands.at(-1).final)).toBe(true);
  }
});

test("HEX editing, linking, swatch selection and stale host messages", async ({ page }) => {
  await page.getByRole("button", { name: "Foreground color", exact: true }).dblclick();
  const hex = page.getByLabel("HEX", { exact: true });
  await expect(hex).toBeFocused();
  await hex.fill("no");
  await hex.press("Enter");
  await expect(page.getByRole("alert")).toHaveText("Enter six HEX digits");
  await hex.fill("#FF0080");
  await hex.press("Enter");
  await expect(hex).toHaveCount(0);
  await expect(page.getByLabel("R value")).toHaveText("255");
  await page.getByRole("button", { name: "Link foreground and background" }).click();
  await expect(
    page.getByRole("button", { name: "Link foreground and background" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => {
    const stale = {
      channel: "kio-color-picker",
      version: 2,
      session: window.session,
      type: "state",
      seq: 0,
      state: window.hostState,
      error: "",
      visible: true,
    };
    window.deliver(stale);
    window.deliver({ ...stale, seq: 999 }, "https://untrusted.example");
  });
  await expect(page.getByLabel("R value")).toHaveText("255");
  await page.getByRole("button", { name: "Background color", exact: true }).click();
  await expect(page.getByRole("button", { name: "Background color", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
