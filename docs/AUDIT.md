# Initial audit and stabilization — 2026-10-14

## Inventory

The initial workspace contained index.html (3216 bytes), styles.css (5336), main.js (14705), manifest.json (1159), README.md (1091), four 640/900 px picker PNGs and six icon PNGs. No subprojects, historical versions, Git repository, AGENTS.md, package.json, tests, LICENSE or CCX were found. v0.2.5 is the only and therefore latest available implementation; no comparison with absent versions or packages is possible.

Manifest v5 loaded index.html and one pickerPanel; old ID work.kio.mini-color-picker; minimum PS 27.0. Original code used CommonJS photoshop/uxp, DOM event handlers, CSS Flexbox and raster overlays. No third-party runtime dependencies. All color/state/UI/host logic was in main.js. Original SolidColor construction via app.SolidColor was consistent with the Adobe reference; it was retained.

## Findings and disposition

| Priority | Baseline finding | Change / remaining validation |
| --- | --- | --- |
| High | Brightness formula 1-t*(0.45+0.55*s) cannot express low-value low-saturation colors; inverse clamps and indicator disagrees with RGB | Full SV mapping, with coordinated CSS gradients and exhaustive domain tests. Actual UXP gradient composition still needs visual QA. |
| High | Resetting an 85 ms debounce on every move postpones all writes until pauses | 40 ms throttle with final flush; gesture simulation passes. Host latency remains unmeasured. |
| High | executeAsModal timeOut:1500 is seconds, not milliseconds | 1.5 seconds; API v2 explicit. |
| High | Every queued operation contains both colors, compared against cached host state | Only edited swatches are queued; fresh reads inside modal; pending writes serialized/coalesced. External untouched swatch test passes. |
| High | Poll/show reconstruction discards exact HSB of unchanged colors and black saturation | Compare RGB before reconstruction; preserve latent hue/saturation. |
| Medium | HEX could retain focus during picker drag; no hide lifecycle; poll runs while hidden | Close/blur only HEX on picker operations/hide/blur; cleanup canceled drags; stop hidden polling. Native keyboard outcome unverified. |
| Medium | Poll only, 500 ms latency | Notifications plus polling fallback; own notifications suppressed while writing. |
| Medium | Wheel could reach 820 px and HEX overflow at 205 px panel width | 480 px wheel cap and right-anchored HEX; dimension tests pass, actual rendering pending. |
| Medium | Monolithic controller; no reproducible validation or package provenance | Extracted pure math and host adapter, tests, allowlist stage with SHA-256. |
| Resolved | Inherited PNG/code provenance was initially undocumented | Owner confirmed both were created from scratch on 2026-10-14; MIT LICENSE added with Kiochan attribution. |

The original gradient used a grey left vertex. The corrected mapping intentionally changes that vertex to black, yielding a full rotated SV square while preserving mouse interaction and diamond shape. Legacy overlay files remain locally but are no longer loaded or staged. The hue-ring artwork is unchanged. Decoded PNG samples at the six primary/secondary hue positions match the selector angles within one RGB byte; center and corner alpha are zero. Actual UXP rendering must still be checked in Photoshop.

## Current structure

Root HTML/CSS and loader; src/main.js UI controller; src/color/conversions.js and state.js; src/ui/geometry.js; src/photoshop/color-sync.js; tests/run.js; scripts/check.js and stage.js; bilingual README, changelog, contribution guide and docs. Brand is 0.3.0 beta candidate with com.kiochan.colorpicker; old installations are independent.

## Evidence and limits

11 regression suites passed in Node via its VM/module APIs. The execution service could not start PowerShell (CreateProcess access denied), so equivalent Node entry functions were invoked in the available Node runtime rather than claiming shell npm commands ran. Resource check passed. No Photoshop 27.2 / UDT session, browser render, official CCX or installation was exercised. The conventional Adobe directory lists Photoshop 2025; that does not establish which hosts may be installed elsewhere or running.

Remaining gates: UXP load/render, screenshot, color-management and keyboard testing, official UDT packaging and clean install. No Git operations or remote publication were performed.

## Official references consulted

- [SolidColor](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/classes/solidcolor)
- [Modal timeout units](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/objects/returnobjects/executeasmodaloptions)
- [Background gradients](https://developer.adobe.com/photoshop/uxp/2022/uxp/reference-css/Styles/background/)
- [Official packaging](https://developer.adobe.com/photoshop/uxp/guides/distribution/packaging-your-plugin/)
