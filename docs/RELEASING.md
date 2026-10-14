# Preparing the first beta

Automated option: see [CI and releases](CI.md). The Release workflow packages with the unmodified packaging module from pinned Adobe CLI source and publishes on a matching tag push; manual dispatch only builds downloadable artifacts. The UDT procedure below remains available for local packaging.

Current candidate: 0.3.0. Suggested future Git tag: v0.3.0-beta.1; UXP manifest/package version remains numeric 0.3.0. Suggested GitHub repository description: Lightweight Photoshop UXP color picker with a hue wheel, SV diamond and linked foreground/background colors.

1. MIT licensing is in place following the owner’s confirmation that inherited code and PNGs were created from scratch (docs/PROVENANCE.md). Preserve LICENSE in source and packaged distributions, and document the provenance of any future third-party material.
2. Keep manifest.json and package.json version equal; update CHANGELOG. Run npm test and npm run check. Complete docs/TESTING.md and save actual screenshots. Record unresolved host issues honestly in README and release notes.
3. Run npm run stage. It creates dist/kio-color-picker-0.3.0 containing 14 runtime files and LICENSE plus a sibling SHA-256 list. Existing stages are not overwritten. Load THIS staged manifest in UDT and repeat acceptance smoke tests so packaged bytes are the tested ones.
4. In Adobe UXP Developer Tool, use the plugin row Actions menu > Package. Select a suitable output location and name kio-color-picker-0.3.0-beta.1.ccx. Follow the tool's ID/distribution requirements; validate that com.kiochan.colorpicker is accepted for the chosen route. If Adobe registration requires a different ID, document the resulting separate-install behavior. Do not rename a ZIP to CCX.
5. Install through Creative Cloud on a clean profile, record actual package hashes and results, and retain staging hashes. Compare the packaged contents with the staged runtime using the packaging tool output/package inspection where supported. No baseline CCX exists in the supplied workspace to compare.
6. Prepare draft release notes with features, independent ID migration, supported/tested versions, install steps, known limitations, source commit and artifact checksum. Push a release tag only when intending to publish that version; a matching tag now triggers automated publication.

This workspace has not executed UDT Package, generated a CCX, validated installation or published a release. The stage directory is only local packaging preparation, not evidence of official packaging success.

Official process: [Adobe Packaging Your Plugin](https://developer.adobe.com/photoshop/uxp/guides/distribution/packaging-your-plugin/).
