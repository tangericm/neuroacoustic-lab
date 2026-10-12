# Browser release checks

Inspected on October 12, 2026 in the Codex Chromium in-app browser on the local Windows / RTX 5080 workstation. These observations cover the production Vite preview, not every browser or device.

- Anatomical mesh, ellipsoidal boundaries, array disks, target annotation, coherent pressure slice, selected-element field, and harmonic phase controls rendered correctly. The atlas is visibly identified as context for the simpler acoustic phantom.
- Default 64-element / 96-square image / eight-acquisition scenario measured 830 ms on a cold production run. Subsequent default updates were 525–741 ms. Rendering displayed 57–60 FPS in sampled one-second windows. These are snapshots, not sustained performance guarantees.
- A placement search exposed all 27 candidates and changed the sampled concentration score from 12.44 to 13.45 dB in 489 ms. Restoration recovered the original 118 mm radius and element coordinates. A separate search was canceled while running; the original scenario recomputed without applying a candidate.
- Keyboard azimuth editing moved element 0 along the array sphere. Disabling it produced 63 active receivers, zero selected-element contribution, and freshly reconstructed images.
- JSON download contained the current disabled-element state and edited angle. A 22,457-character settings URL restored these settings after reload. No RF data or personal documents are included in the URL.
- PNG comparison export downloaded successfully and was visually inspected; the four maps share the displayed baseline scales. A copy is in `docs/figures/model-comparison.png`.
- Target presets, homogeneous/uncorrected/corrected modes, rapid target edits, assumed-sound-speed edits, layer controls, phase playback, guided steps, reset, frozen reference maps, and methods were exercised.
- At a 390 × 844 viewport, controls and plots stack beneath the 3D scene. The page's scroll width remained within the viewport; the full-page screenshot showed readable controls and plots. The viewport override was then removed.
- Direct 3D brain clicking changed the target to `(42.479, -19.656, 38.747) mm`, updated the slice, and completed a fresh calculation. The target was then reset.
- A final renderer-loading fix was checked against production asset `index-BAtRLtqT.js`: fresh reload, atlas completion, layer removal/remount, and guided uncorrected-to-corrected transitions produced no new error or warning entries for that build. The earlier nested-overlay teardown error was not suppressed; its ownership path was removed.

The source and lifecycle checks cover renderer failure fallback, stale worker results, owned geometry disposal, and reduced-motion behavior. Safari, Firefox, touch dragging, and operating-system reduced-motion preference were not independently exercised in this browser session. WebGPU is not used.

Final publication checks and URLs are recorded in the implementation ledger.

The live Vercel origin was checked without an authentication cookie: HTTP 200, complete anatomy, a default computation of 854 ms, both reference maps, and no new origin-specific error/warning logs. `docs/figures/workspace.jpg` records the live workspace. GitHub's Ubuntu CI passed both jobs.
