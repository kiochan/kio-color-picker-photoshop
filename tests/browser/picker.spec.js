const { test, expect } = require("@playwright/test");
const { hsvToRgb } = require("../../build/color/conversions.js");
const { hsvToPoint } = require("../../build/ui/geometry.js");

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("close", () => expect(errors).toEqual([]));
  await page.addInitScript(() => {
    window.commands = [];
    window.hostState = {
      colors: { fg: { r: 36, g: 179, b: 36 }, bg: { r: 153, g: 43, b: 31 } },
      hsv: { fg: { h: 120, s: 0.8, v: 0.7 }, bg: { h: 6, s: 0.8, v: 0.6 } },
      active: "fg",
      linked: false,
      relative: { h: 0, s: 0, v: 0 },
    };
    window.deliver = (message, origin = "com.kiochan.colorpicker", source = window.uxpHost) => {
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
        } else window.commands.push(message);
      },
    };
  });
  await page.goto("/");
  await expect(page.locator(".status")).toBeEmpty();
});

test("pointer cancellation and host hide terminate gestures and close the HEX editor", async ({
  page,
}) => {
  const picker = await page.getByTestId("picker").boundingBox();
  await page.mouse.move(picker.x + picker.width * 0.5, picker.y + picker.height * 0.3);
  await page.mouse.down();
  await page.locator(".picker-input").dispatchEvent("pointercancel");
  await expect.poll(() => page.evaluate(() => window.commands.at(-1)?.command.kind)).toBe("finish");
  await page.mouse.up();
  await page.getByRole("button", { name: "Foreground color", exact: true }).dblclick();
  await expect(page.getByLabel("HEX", { exact: true })).toBeFocused();
  await page.evaluate(() =>
    window.deliver({
      channel: "kio-color-picker",
      version: 1,
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
    await expect
      .poll(async () => {
        const picker = await page.getByTestId("picker").boundingBox();
        return picker.width;
      })
      .toBe(Math.max(1, Math.floor(Math.min(width - 26, height - 149, 480))));
    const picker = await page.getByTestId("picker").boundingBox();
    const sliders = await page.getByRole("region", { name: "RGB sliders" }).boundingBox();
    expect(Math.abs(picker.x + picker.width / 2 - width / 2)).toBeLessThan(1);
    expect(Math.abs(sliders.x + sliders.width / 2 - width / 2)).toBeLessThan(1);
    expect(picker.width).toBe(picker.height);
    expect(sliders.y).toBeGreaterThanOrEqual(picker.y + picker.height);
    expect(sliders.y + sliders.height).toBeLessThanOrEqual(height);
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
        version: 1,
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
  await expect.poll(() => page.evaluate(() => window.commands.at(-1)?.command.kind)).toBe("finish");
  const count = await page.evaluate(() => window.commands.length);
  await page.mouse.move(200, 200);
  expect(await page.evaluate(() => window.commands.length)).toBe(count);
  await expect
    .poll(async () => (await page.getByTestId("picker").boundingBox()).width)
    .not.toBe(picker.width);
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
      version: 1,
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
