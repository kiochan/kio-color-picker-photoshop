# Contributing

Use Node.js 22+, Photoshop 27.x, and UXP Developer Tool. Run `npm ci` first.

Before submitting a change, run:

```sh
npm test
npm run check
```

Edit TypeScript in `src/`; use `npm run watch` for compilation and `npm run format` for Biome formatting. Build before loading the plugin. Keep UXP globals separate from Node tooling types; SDK declaration gaps are isolated in `src/uxp-compat.d.ts` and the UI entrypoint adapter.

For bug reports, include your Photoshop version, steps to reproduce, expected behavior, and relevant screenshots or errors. Remove private information.

Keep pull requests focused, describe the change and validation performed, and add regression tests for behavior fixes. Use the [Photoshop test checklist](docs/TESTING.md) for host verification.

Contributions must be original or use compatible licensing. See [MIT License](LICENSE).
