# CI and releases

- **CI** runs tests and resource checks on Windows and Linux for pushes and pull requests.
- **Release → Run workflow → main** builds a CCX as an Actions artifact without publishing.
- Pushing a `vX.Y.Z` tag builds and publishes a GitHub Release. Tags ending in `-alpha.N`, `-beta.N`, or `-rc.N` publish as prereleases.

## Publish

1. Keep `manifest.json` and `package.json` versions equal. Update `CHANGELOG.md`.
2. Run `npm test` and `npm run check`, then complete the [Photoshop test checklist](TESTING.md).
3. Commit and push the changes. Use a manual Release run to check the installer.
4. Create and push a new version tag matching both version files. For example, after updating both to 0.3.1:

```sh
git tag v0.3.1
git push origin v0.3.1
```

Release assets include the CCX, SHA-256 checksum, and build provenance. The workflow uses the built-in `GITHUB_TOKEN`; no personal token is required. Existing releases and published tags are not overwritten.

After a workflow fix, start a new run on the updated commit. Re-running an old job uses its original code.

## Local packaging

Run `npm run stage`, then load the generated `dist/kio-color-picker-VERSION/manifest.json` in UXP Developer Tool. Use **Actions → Package** to create a CCX, then test installation through Creative Cloud Desktop. The staging directory can be deleted and regenerated; an existing stage is not overwritten.

## Packaging implementation

CI invokes the unmodified packaging module from Adobe CLI source pinned to `ef7e127b0e234e82b94d94e0c18443f3a738f929`. Dependencies use the upstream lockfile with lifecycle scripts disabled, avoiding unrelated native desktop builds. The internal module is pinned because its API is not guaranteed stable.

The workflow validates the manifest and packaged file contents. Photoshop rendering, color management, shortcuts, and installation still require host testing.
