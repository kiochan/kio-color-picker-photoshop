# Changelog

## 0.4.1

- Keep local color intent stable through delayed or lost messages; confirm successful Photoshop writes and offer retry on failure.
- Smooth the diamond's muted-color transitions and keep color mapping aligned with selection.
- Scale the complete panel, unify readable text, and move HSB values above the wheel.
- Add cursor and RGB marker easing, point the hue marker toward the center, and fix RGB ramp edge seams.

## 0.4.0

- Match the reference diamond: white at top, neutral gray at left, pure hue at right, black at bottom; keep Canvas colors and pointer mapping aligned.
- Move the interface to an offline local WebView with React and TypeScript. Draw the wheel and diamond on Canvas; keep Photoshop synchronization and settings in UXP behind a validated message bridge.
- Add browser tests for actual gradient pixels, edge transparency, responsive layout, pointer capture, and HEX editing.
- Add `npm run dev` for a live browser preview with simulated colors, saved preview state, and automatic reload.

## 0.3.1

- Replace unsupported SVG diamond gradients with transparent PNGs to fix the solid black picker in Photoshop.
- Clip the diamond's square color base to prevent colored seams at the overlay edges.

## 0.3.0

- Migrate runtime code to strict TypeScript with Adobe API types; add Biome and locked development dependencies. Compile and test CommonJS output before CI packaging.
- Fix the 45-degree diamond display and color mapping.
- Refine selection cursors with thinner black borders.
- Simplify project documentation.
- Rename to Kio Color Picker with plugin ID `com.kiochan.colorpicker`.
- Improve color mapping, dragging, host synchronization, and keyboard focus cleanup.
- Save the foreground/background link setting and improve cursor visibility.
- Add modular code, automated tests, MIT licensing, and CI releases with CCX packages.

## 0.2.5

- Supplied Mini Color Picker prototype with hue wheel, diamond, RGB sliders, HEX input, and linked colors.
