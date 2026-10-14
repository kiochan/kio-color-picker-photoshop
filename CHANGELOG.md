# Changelog

## 0.3.0 — unreleased beta candidate

- Persist the foreground/background link toggle across plugin reloads. Re-establish the relation from Photoshop's current colors on startup.
- Keep diamond/slider drag coordinates fixed for each gesture; avoid layout work on unchanged host-write status. Distinguish acknowledged host RGB echoes from external edits to prevent linked feedback and preserve precise HSB cursors.
- Increase selection marker size and use explicit black/white double borders for visibility across bright and dark colors.

- Fix CI installation failure in robotjs by skipping dependency lifecycle scripts and invoking Adobe’s pinned packaging module without the GUI/service toolchain; retain manifest/package-content checks.

- Add Windows/Linux CI and version-tag releases using the official Adobe CLI, CCX content verification, checksums and build provenance. Manual release workflow runs build artifacts without publishing.

- Rename the plugin to Kio Color Picker; new independent plugin ID com.kiochan.colorpicker.
- Replace incomplete diamond brightness mapping with a full rotated SV square and matching CSS gradients.
- Preserve precise HSB at black and on unchanged RGB refreshes.
- Throttle continuous drag writes; serialize and coalesce pending host writes without overwriting untouched swatches.
- Correct executeAsModal timeout from 1500 seconds to 1.5 seconds; explicitly request Photoshop API v2.
- Supplement polling with notifications; stop polling on panel hide, finish canceled gestures, and release HEX focus on picker interactions and hide.
- Cap the wheel at 480 px; keep RGB below it; place HEX within narrow panels.
- Extract testable modules, add 11 automated suites, resource checks, runtime staging, bilingual documentation and host acceptance steps.
- Add the MIT License for code and PNG assets following the owner’s confirmation of original authorship; include LICENSE in the packaging stage.
- Photoshop validation and official CCX remain pending.

## 0.2.5 — supplied baseline

Only this version was present. Its manifest identifies Mini Color Picker and work.kio.mini-color-picker. The supplied README describes vertical layout, real RGB ramps, linked colors and prior Chromium/simulated validation; these historical validation claims were not independently reproduced. No earlier versions or CCX were supplied. No release dates are inferred.
