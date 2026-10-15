# Contributing

Use Node.js 22+, Photoshop 27.x, and UXP Developer Tool. Run `npm ci` first.

Before submitting a change, run:

```sh
npm test
npm run check
```

Edit the UXP host/shared logic in `src/` and React UI in `webview/`; `npm run watch` builds both. Run `npx playwright install chromium` once, then `npm run test:browser` after building UI changes. Use `npm run format` for Biome. Keep UXP, browser, and Node types separate. SDK declaration gaps are isolated in `src/uxp-compat.d.ts`.

For bug reports, include your Photoshop version, steps to reproduce, expected behavior, and relevant screenshots or errors. Remove private information.

Keep pull requests focused, describe the change and validation performed, and add regression tests for behavior fixes. Use the [Photoshop test checklist](docs/TESTING.md) for host verification.

Contributions must be original or use compatible licensing. See [MIT License](LICENSE).
