# Kio Color Picker

A lightweight Photoshop color picker with a hue wheel, saturation/brightness diamond, RGB sliders, HEX input, and linked foreground/background colors.

## Install

Requires Windows 11, Photoshop 2026 (27.x), and Adobe UXP WebView Support.

Download the `.ccx` from [Releases](https://github.com/kiochan/kio-color-picker-photoshop/releases/latest), install through Creative Cloud Desktop, and open **Plugins → Kio Color Picker** in Photoshop.

## Use

- Drag the wheel, diamond, or RGB sliders to choose a color.
- Click a swatch to edit foreground or background; double-click for HEX input.
- Click the chain to link both colors. The setting is saved across restarts.

Photoshop compatibility and shortcut behavior are still being tested. [Test checklist](docs/TESTING.md).

## Develop

Use Node.js 22+. Install dependencies and build before loading `manifest.json` in UXP Developer Tool.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5173` for a live browser preview with simulated colors. Edits reload automatically; this preview does not connect to Photoshop.

```sh
npm run build
npm test
npm run check
npm run stage
```

`src/` contains the UXP host and shared color logic; `webview/` is the local React + TypeScript interface. The picker draws on Canvas and runs offline. Biome handles formatting and linting. Use `npm run watch` to compile both layers and `npm run format` to format source. Browser checks: `npx playwright install chromium`, then `npm run test:browser` after building. Only compiled code, styles, and runtime resources are packaged.

[CI and release instructions](docs/CI.md) · [MIT License](LICENSE)
