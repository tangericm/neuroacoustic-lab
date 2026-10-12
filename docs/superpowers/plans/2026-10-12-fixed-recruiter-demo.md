# Fixed Recruiter Demo Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task. User requested parallel agents and approved the fixed-demo design in chat.

**Goal:** Replace the default simulator surface with two concise, fixed visual demonstrations.

**Architecture:** Generate versioned finite-pulse and synthetic-aperture fixtures using the existing numerical core. A small landing shell lazy-loads the focus and imaging presentations, while the existing simulator remains an optional advanced view. Physical inputs are immutable in the new views.

**Tech Stack:** React, TypeScript, Vite, Three/R3F, Node gzip, existing SI numerical core.

**Spec:** `docs/RECRUITER_DEMO_DESIGN.md`

## Global constraints

- One fixed array/plane/target in the focusing experience; no acoustic-parameter or target controls.
- Focused transmit and synthetic-aperture imaging are distinct experiments.
- Generate imagery from model values and acquired channels; fixed shared display scales.
- Precompute expensive work; animation must stop when paused/offscreen or reduced motion is selected.
- Preserve analytics, attribution, scientific references, and advanced scenario links.
- Shared contracts: `src/demo/types.ts`; no new product dependencies.

## Tasks and ownership

1. **Scientific fixtures** — `src/demo/generate-fixtures.ts`, `scripts/generate-demo.mjs`, `public/demo/*`, `tests/demo-physics.test.ts`. Consume `FocusDemoFixture` and `ImagingDemoFixture`; generate `/demo/focus.json`, `/demo/imaging.json`, gzipped signed-int16 pulse frames, gzipped float32 RF. Use current ray travel times, directivity, attenuation, fixed-energy delays; check aligned target arrivals. Image partials must equal masked-channel DAS; final partial equals full reconstruction. Publish config, seed, assumptions, source hashes, and asset timings/sizes. Agent owns these files only.
2. **Focused scene** — `src/demo/FocusedUltrasound.tsx`, `src/demo/focusSceneUtils.ts`, minimal exports/palette options in `src/components/HeadScene.tsx`, `tests/demo-focus.test.ts`. Consume `{ fixture: FocusDemoFixture; frames: Int16Array }`. Export a default React component with exactly those props; own its Play/Pause/Replay controls. Reuse atlas geometry transformation and ownership. Fixed plane uses fixture geometry, fixed target uses scenario. Show finite-pulse cached frames with physical time; no per-frame React updates or texture allocation. Demand rendering while paused, visibility/reduced-motion handling, context/error fallback.
3. **Landing and imaging** — root controller owns `src/demo/loaders.ts`. UI agent owns new `src/demo/RecruiterDemo.tsx`, `src/demo/ImagingDemo.tsx`, `src/demo/demo.css`, `src/App.tsx`, advanced view preservation, `tests/demo-ui.test.ts`. Consume loaders `loadFocusDemo(): Promise<{fixture:FocusDemoFixture;frames:Int16Array}>` and `loadImagingDemo(): Promise<ImagingDemoFixture>`. Focus component import is lazy. Images/traces come from frozen fixtures; story controls are Echoes/Align/Reconstruct and Replay. Keep copy short and captions explicit. Advanced access via `?view=lab`; existing `#s=` scenario links open the original simulator. Root provides renamed `src/LabApp.tsx` and updates old source-contract tests before dispatch.
4. **Integration and release** — root owns docs, loaders, package generator script, integration checks, browser QA and final publication. Validate gzip lengths/version/finite values with bounded loaders; handle failed fetches. Check source/domain links, analytics, mobile, playback, pause, replay, stage navigation, graceful renderer failure, and operation separation. Independent scientific and UI/final reviews before publishing.

## Review focus

- Pulse-frame physical sampling, fixed normalization, and arrival times; no steady-state field mislabeled as a finite pulse.
- Same-channel comparisons and true partial sums; no independent per-image normalization.
- No numerical worker in the default view; paused/offscreen loops genuinely stop.
- Cached fetch/resource lifetime and React/R3F ownership; no nested DOM roots or repeated GPU allocation.
- Shared URL compatibility, missing assets, reduced motion, narrow screens, and no-WebGL image access.

## Progress

- [x] Fixture generation and scientific checks. Final focus quantity is the coherent pulse envelope; carrier aliasing and retained display sampling limits are documented.
- [x] Focus scene and playback checks.
- [x] Landing/imaging presentation and interaction checks.
- [x] Integrated review, production-browser checks, and release. Implementation `a517592`; GitHub CI run `38296733763` passed; production deployment `dpl_BEWZrj9ff6gyPoTWfaLtr4qBkgew` is ready at the existing domain.

Ruling: use the clean standalone checkout on a feature branch, with separate file ownership; dependencies and offline reference environment already live here. Cross-file integration is verified by the controller.
Ruling: the user's “proceed” authorizes implementation and the existing GitHub/Vercel release workflow; no repeated design-approval round is needed.
