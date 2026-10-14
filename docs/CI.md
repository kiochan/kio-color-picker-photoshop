# CI and automated GitHub Releases

## Workflows

- **CI** runs on branch pushes, pull requests and manual dispatch. Windows and Linux jobs run the plugin tests, release-verifier tests, resource checks and runtime staging. Artifacts contain UDT source directories, not CCX installers.
- **Release** runs on v-prefixed tag pushes or manual dispatch. It tests and stages the source, installs dependencies from Adobe’s pinned source checkout using its lockfile with lifecycle scripts disabled, directly calls the unmodified Adobe `PluginPackageCommand.package()` module, and verifies the resulting CCX against the exact runtime allowlist. It uploads CCX, SHA256SUMS.txt, build-info.json and release notes as an Actions artifact.
- Only **tag pushes** publish a GitHub Release after packaging succeeds. Manual dispatch builds artifacts without publication. Tags with alpha/beta/rc suffixes become GitHub prereleases.

The workflows use GitHub-hosted runners and the built-in GITHUB_TOKEN. No personal access token or Adobe account secret is configured. Write permission is limited to the publish job; Adobe installation and packaging run in a separate read-only job. PR workflows never publish or install the Adobe CLI.

## Enable and test

1. Commit .github/workflows, scripts/release-meta.js, scripts/package-ccx.js, scripts/verify-ccx.js, tests/release.js, tests/package-ccx.js and the documentation changes, then push main.
2. Open the repository's Actions tab and confirm **CI** succeeds.
3. Select **Release → Run workflow → main**. This is a packaging trial only. Download the **release-assets** artifact once successful.
4. Install the resulting CCX and perform docs/TESTING.md before publishing a version intended for users.

The first cloud run passed plugin tests, release checks and staging, then failed while compiling the full CLI’s robotjs dependency. The revised packaging path has local adapter tests but still requires a fresh successful cloud run. Local validation covers script syntax, version rejection, package-content verification with synthetic archives, and existing plugin tests. The pinned dependency installation skips lifecycle scripts, so it does not build robotjs, Electron or native desktop helpers. If installation or packaging fails, the job stops; it does not substitute a homemade ZIP. Inspect the failing Actions step and logs.

## Publish the first beta

After committing all intended changes and verifying the manual run, use:

```powershell
git tag v0.3.0-beta.1
git push origin v0.3.0-beta.1
```

This action intentionally publishes a public prerelease after successful CI packaging. The tag's numeric version must equal both manifest.json and package.json. Supported forms are vX.Y.Z and vX.Y.Z-alpha.N / beta.N / rc.N. A later release must use a new tag; update both numeric versions when changing X.Y.Z.

For v0.3.0-beta.1, the downloadable installer is kio-color-picker-0.3.0-beta.1.ccx. Release assets include the installer SHA-256 and source/packager commit IDs. The notes explicitly state that cloud CI does not run Photoshop or establish host compatibility.

Existing GitHub Releases are not overwritten. Re-running a completed publish will fail on the existing tag rather than replacing assets. If packaging fails before publication, re-run the failed workflow after resolving runner/tooling issues; source fixes belong in a new commit and new tag. Never move an already published tag to different code.

## Tooling and limits

Adobe CLI source is pinned to ef7e127b0e234e82b94d94e0c18443f3a738f929. Its repository documents manual installation; the workflow uses Yarn 1.22.22 and the upstream frozen lockfile with --ignore-scripts. Only the packaging module is loaded, rather than the CLI/service entry point. Its dependency chain uses JavaScript (including archiver, ignore-walk and lodash); the desktop automation/native modules are not loaded. Adobe dependencies are not added to the plugin or its installation package.

This adapter uses an internal module pinned to the exact upstream commit, not a stable public Adobe API; upstream updates require rechecking its constructor, package() and result contract. Adobe’s package() retains validateForPackaging checks in packageHost(). The adapter does not invoke execute() or claim Photoshop-dependent strict manifest validation. Our archive checks verify filenames, content and manifest equivalence; neither those checks nor official packaging prove Creative Cloud installation, color behavior or shortcut recovery.

References: [Adobe CLI packaging and installation](https://github.com/adobe-uxp/devtools-cli/blob/ef7e127b0e234e82b94d94e0c18443f3a738f929/packages/uxp-devtools-cli/README.md), [GitHub token permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions), [GitHub CLI release creation](https://cli.github.com/manual/gh_release_create).

## Installation failure observed on 2026-10-14

The original full installation attempted to build robotjs on Node 22.23.3 because no matching prebuilt binary was available. node-gyp then failed to recognize Visual Studio 2026 (version 18) on windows-latest. This occurred before packaging, not in the plugin tests. The repair disables dependency lifecycle scripts and avoids loading the GUI/automation entry points entirely; it does not suppress packaging or CCX-verification failures.

After pushing this fix, start a NEW Release → Run workflow on main. Re-running the old job uses its original commit and cannot pick up the fixed workflow.
