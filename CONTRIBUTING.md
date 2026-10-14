# Contributing

This project, including its bundled PNG assets, uses the [MIT License](LICENSE). Contributions should be original or have compatible licensing; identify any third-party material and preserve its required notices.

Use Node.js 18+, Photoshop 27.x and UXP Developer Tool. Run npm test and npm run check; then use docs/TESTING.md in Photoshop. No dependencies or bundling step are required.

For bugs include Windows version, exact Photoshop/UXP/UDT versions, panel dimensions/docking, document mode/profile/bit depth, reproducible steps, expected/actual behavior, and relevant console messages. For shortcut failures include whether HEX was open and whether a plain canvas click restores B/E/X. Remove private document content and paths from screenshots/logs.

Keep changes focused and preserve responsive vertical layout and non-quantized HSB. Add regression coverage for behavior changes. PRs should describe the concrete problem, resulting behavior, checks run, and host checks still pending. Do not copy proprietary plugins, include CCX/ZIP archives, introduce dependencies without need, or claim simulated tests prove host behavior.
