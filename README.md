# Kio Color Picker

[简体中文](README.zh-CN.md)

A compact, dependency-free Adobe Photoshop UXP color picker for painting workflows. Version **0.3.0 is a beta candidate**, derived from the supplied Mini Color Picker 0.2.5 prototype. No release or official CCX has been produced.

Features: circular hue wheel; clamped saturation/brightness diamond; actual RGB channel gradients; foreground/background selection and optional bidirectional HSB offsets; six-digit HEX paste/edit; compact vertical layout. Click a swatch to select it; double-click to open HEX, Enter to apply, Escape to cancel. Click the chain to link colors. Link offsets are fixed until relinking or a simultaneous external change of both colors; S/B clip at boundaries.

The corrected diamond is a rotated SV square: white at top, hue at right, black along the lower-left edge. At zero brightness, saturation remains latent so the pointer does not jump when RGB becomes black. This replaces the prototype's incomplete brightness mapping.

## Screenshot

A verified Photoshop screenshot is pending. Add a capture to docs/screenshots after completing the [host checklist](docs/TESTING.md); this repository does not present a browser mockup as a Photoshop capture.

## Requirements and installation

Target: Windows 11, Photoshop 2026 / 27.x (manifest minimum 27.0; acceptance target 27.2), Adobe UXP Developer Tool and Creative Cloud Desktop. Host compatibility is not yet validated. Node.js 18+ is needed only for development checks.

For development, enable Photoshop's developer mode under Preferences > Plugins, restart when requested, add the root manifest.json in UXP Developer Tool, and Load. Open Kio Color Picker in Photoshop's Plugins menu. The ID is now com.kiochan.colorpicker: it installs separately and does **not** replace work.kio.mini-color-picker.

When a tested CCX is eventually available, download it from this repository's Releases and install through Creative Cloud Desktop. There is currently no verified installable release.

## Development

No npm install, bundler, web framework, WebView or network permission is required.

- npm test — conversion, geometry, state, gesture and simulated Photoshop tests.
- npm run check — syntax, version agreement, manifest/resource references and icon dimensions (not Adobe schema or host validation).
- npm run stage — copy an explicit runtime allowlist into dist/kio-color-picker-0.3.0 and create file hashes. Refuses to overwrite an existing stage. This is a UDT input directory, not a CCX.

Root index.html/styles.css and the tiny main.js entry load src/main.js through UXP CommonJS. src/color contains pure color functions and link math; src/ui contains geometry/layout math; src/photoshop isolates host reads, modal writes and queue serialization. The UI controller owns interaction state. Tests use Node's standard library only.

## Validation and known limitations

11 automated suites passed through a Node runtime on 2026-10-14. Layout tests verify computed dimensions, not actual UXP rendering. Photoshop loading, screenshots, color-managed documents, stylus input, native shortcuts, CCX installation and UDT packaging remain unverified. See [audit](docs/AUDIT.md), [test procedure](docs/TESTING.md), and [release procedure](docs/RELEASING.md).

Polling every 500 ms supplements set/exchange/reset notifications. Continuous edits are throttled to 40 ms, but Photoshop modal availability determines actual latency. A modal failure shows an error; a subsequent edit can retry. An edit in progress wins for the edited swatch; unrelated external swatches are preserved. Hidden panels stop polling. No automatic focus transfer to the Photoshop canvas is claimed.

## Licensing

Code, documentation and bundled PNG assets are licensed under the [MIT License](LICENSE), copyright (c) 2026 Kiochan. The project owner confirmed the inherited code and PNGs were created from scratch; see the [provenance record](docs/PROVENANCE.md).
