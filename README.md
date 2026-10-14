# Kio Color Picker

A lightweight Photoshop color picker with a hue wheel, saturation/brightness diamond, RGB sliders, HEX input, and linked foreground/background colors.

## Install

Requires Windows 11 and Photoshop 2026 (27.x).

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
npm run build
npm test
npm run check
npm run stage
```

`src/` uses strict TypeScript with Adobe API types. Biome handles formatting and linting. Use `npm run watch` while developing and `npm run format` to apply formatting. Only compiled JavaScript and runtime assets are packaged.

[CI and release instructions](docs/CI.md) · [MIT License](LICENSE)
