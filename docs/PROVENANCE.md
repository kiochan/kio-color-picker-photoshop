# Provenance record

On 2026-10-14 the project owner confirmed: “继承代码和 png都是从0写的” (the inherited code and PNGs were created from scratch). Together with the original request to use MIT, this resolves the earlier provenance question. The project code, documentation and bundled PNG assets are covered by the root [MIT License](../LICENSE), with copyright attribution to Kiochan.

This record documents the owner's confirmation; it does not claim an independent authorship audit. The original handover described a ChatGPT-assisted prototype. No MagicPicker or FocusFix files were found or imported.

| Material | Current use | Provenance |
| --- | --- | --- |
| Inherited HTML, CSS, JS and manifest | Retained and modified | Created from scratch, confirmed by owner. |
| assets/hue-ring.png | Runtime | Created from scratch, confirmed by owner. |
| assets/diamond-white.png, diamond-black.png, diamond-matte-dark.png | Retained; superseded by CSS gradients, not staged | Created from scratch, confirmed by owner. |
| icons/panel.png, panel@2x.png, plugin.png, plugin@2x.png | Runtime | Created from scratch, confirmed by owner. |
| icons/header.png, plugin-512.png | Retained; no runtime reference, not staged | Created from scratch, confirmed by owner. |
| New modules, tests, scripts and docs | Created during this revision | No third-party implementation copied; runtime changes build on supplied code. |

Original SHA-256 fingerprints are recorded in original-sha256.json. They identify supplied bytes. No dependencies were added. Future third-party contributions must record their sources and preserve required notices. LICENSE is included in the local UDT packaging stage.
