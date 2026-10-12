# Scalar engine implementation evidence

## Model

SI units. Four nested ellipsoids subtract cumulative scalp, skull, and fluid thickness from each outer semiaxis. Analytic segment/ellipsoid intersections split each straight path into material lengths. Travel time is the sum of length/speed. Pressure includes normal-incidence transmission `2 Z_next / (Z_previous + Z_next)`, center-frequency attenuation `10^(-dB/20)`, spreading normalized to 100 mm, and finite circular-piston directivity `2 J1(ka sin(theta))/(ka sin(theta))`. Back-facing elements contribute zero. Units are relative pressure, not pascals or clinical dose.

Focused continuous-wave fields use sum-squared drive weights exactly one. Corrected delays align actual layered travel times; uncorrected delays use the independently adjustable assumed speed. Homogeneous propagation uses actual brain material parameters throughout the domain, without interfaces. Homogeneous focusing still uses the assumed speed.

RF acquisition is a separate synthetic-aperture sequence: one element emits per shot, with equal shot amplitude `1/sqrt(number of shots)`. The focused CW apodization controls the field, while synthetic-aperture RF uses equal shot drive and uniform DAS receiving. Forward and returning pressure transmission factors use their respective directions. Scatterers occupy a seeded 0.8 mm thin slice with an empty cyst and up to three point reflectors; secondary reflectors outside the acoustic brain are omitted. Gaussian-modulated RF is sampled at eight samples per carrier cycle. Seeded additive Gaussian noise has RMS equal to the noiseless global RF peak times `10^(noiseDb/20)`.

FFT Hilbert transformation produces analytic channel quadrature. Complex DAS interpolates the same acquired RF and quadrature for either layered delays or homogeneous assumed-speed delays. No ground-truth phantom raster enters reconstruction.

## Metric definitions and limitations

- Target gain compares exact target CW pressure with an uncorrected field through the SAME actual medium; homogeneous mode compares against itself.
- Focal error is distance from the sampled global field maximum to the requested target.
- Lateral focal width is the contiguous count of samples at least half the peak pressure on the row through that maximum, multiplied by pixel spacing. It is a coarse sampled width without crossing interpolation.
- The `sidelobeDb` field is an off-focus maximum outside `max(8 mm, 2 * sampled lateral width)` from the sampled peak. It is not a first-null-defined classical sidelobe level.
- Cyst contrast is mean envelope inside 0.8 cyst radii relative to the 1.2–1.8 radius annulus, expressed with 20log10.
- Point localization searches the strongest reconstruction sample within 12 mm of the known central point. This is a local measured diagnostic, not unconstrained detection accuracy.
- `numericBytes` counts returned typed-array payloads. It excludes JavaScript objects, transient FFT arrays, and the retained single-entry propagation cache (approximately 7.1 MB at default grid/array).
- Optimization searches 27 bounded radius/rotation poses at constant drive energy. The objective is `20log10(exact target pressure / maximum sampled off-target pressure)` on a 17×17 xz plane at target y, using the same FOV. Samples outside the brain or within 8 mm of the target are excluded. This pressure ratio in dB equals the corresponding intensity ratio in dB. It is a coarse in-plane local search, not a global whole-brain bound or global design optimum. The current propagation mode and apodization are preserved. It yields between candidates; the UI may terminate a worker to cancel synchronous simulation.

The scalar model has no refraction, shear waves, multiple scattering, reverberation, nonlinear propagation, angle-dependent interface physics, broadband material dispersion, or CT-calibrated skull. Ellipsoid shell subtraction is not constant thickness along surface normals. The brain mesh is visualization only. Same-model Python oracle agreement is numerical verification, not physical validation. The separate k-Wave fixture tests another stated geometry.

## Verification record, 2026-10-12

Before implementation, Node assertion failed because the path solver export was absent; after dependency installation, Vitest recorded nine missing-core failures. Initial implementation passed 9/10 physical tests; the remaining test incorrectly demanded >5% correction improvement. This assumption was removed while retaining exact corrected-arrival coherence and positive measured gain: the smooth concentric skull produces only 0.195 dB gain at the default target.

Additional test-first cycles found and fixed:

1. Returning RF pressure incorrectly reused outgoing transmission (observed 0.08736956 versus independently expected 0.08077807); now paths use opposite transmission directions.
2. Nonfinite noise generated NaN data instead of failing early.
3. Optimized Euler metadata disagreed with rotated element coordinates after an already rotated starting pose (0.206 mm same-angle edit jump); pose generation now uses the final Euler rotation consistently.

Cache equivalence and invalidation tests pass, including reuse after assumed-speed edits and invalidation after actual brain-speed edits. Other tests cover analytic layer lengths/travel, pressure attenuation, fixed energy, corrected phase coherence, minimum separation, reflector timing, linearity, point localization, wrong-speed degradation, and deterministic cyst scatterers. Independent Python fixtures verify 36 paths, Bessel directivity values, and nine complex fields across all three modes.

At 10:22, `npm test -- --reporter=verbose` passed all 22 tests in four files (20 core tests and two UI reference-map tests). TypeScript checks passed core and its tests; the concurrent UI build still reported its separate ImageData typed-array issue in `Diagnostics.tsx` at that checkpoint.

Measured Node/Vitest default run after shared propagation-cache optimization: 780.001 ms total; field 391.896 ms; RF 276.702 ms; reconstruction 109.232 ms. Returned numeric payload 2,614,272 bytes, RF shape `[8,64,1024]`. Measurements are a local snapshot, not a guaranteed browser latency or benchmark across machines.

Default metrics: target relative pressure 2.444735; correction gain 0.194577 dB; sampled focal and local point error 0.893188 mm; sampled lateral width 2.526316 mm; off-focus maximum -6.164095 dB; mean path attenuation 6.106984 dB; cyst envelope contrast -8.235480 dB; drive energy 1.

Exact-target correction gain measurements:

| Target meters | 500 kHz gain dB | 750 kHz gain dB |
|---|---:|---:|
| [0.015, 0, 0.015] | 0.194577 | 0.434079 |
| [0.045, 0, 0.020] | 0.981508 | 0.754389 |
| [0, 0, -0.020] | 0.086828 | 0.191664 |

## Review follow-up, 10:32

Public `simulate` and `optimizePlacement` now validate geometry and acoustic inputs before any numerical cache work. Rejected cases include nonfinite positions, nonfinite or nonunit normals, nonfinite or out-of-range piston radii, nonfinite attenuation exponents, overlapping elements, insufficient head clearance, negative shell thickness, shell depths consuming an entire ellipsoid semiaxis, nonfinite outer radii, and zero enabled elements. A legitimate single-element configuration remains accepted. Point scatterers outside the brain are filtered for peripheral targets.

Individual complex fields are returned element-major in `elementFields.real/imag`, with shape `[element count, size, size]`. They use the exact cached path and weighted focusing phase used for the coherent field; no independent normalization is applied. Disabled elements contribute zero, and summing individual complex arrays reproduces the coherent field within Float32 tolerance. Worker transfer discovery already includes these additional arrays; the persistent path cache is not transferred or copied.

Test-first review reproduction: 12 failures before the changes, followed by 14/14 new checks passing. Fresh complete suite at 10:30:50: 42/42 passed across six files. `npx tsc -b` also passed after the concurrent UI integration completed.

Isolated cold simulation after these changes: **791.215 ms** total (field 415.807 ms, RF 268.334 ms, reconstruction 105.032 ms). Returned numeric payload now **7,332,864 bytes**, including both individual complex arrays of shape `[64,96,96]`. A concurrent whole-suite run measured 1,174.207 ms under shared machine load; these remain measured snapshots, not guaranteed latency. Physical metrics remain unchanged.

## Bounded performance pass, 10:39

One optimization hoists immutable medium/frequency coefficients out of the per-ray loop: inverse squared ellipsoid radii, sound speeds, impedances, and frequency-specific attenuation per meter are prepared once for each propagation-grid or RF acquisition batch. Path intersections and amplitude equations are unchanged. Public `pathBetween` still computes a fresh prepared solver for its given inputs; no global medium-only cache was introduced. Existing propagation-table invalidation semantics remain unchanged.

Before/after measurements used the same Vite-loaded Node engine, unchanged 96×96 grid, 64 elements, eight shots, and physical parameters. Each process ran four simulations with target x perturbed by successive 1 nm increments to force a fresh propagation table on every run. Only the first run in each process is also JIT-cold. Times vary with shared machine load.

| Run | Before total ms | After total ms | Before field ms | After field ms |
|---|---:|---:|---:|---:|
| Fresh process first simulation | 787.240 | 594.650 | 413.907 | 243.497 |
| 2, fresh path table | 761.589 | 563.917 | 381.904 | 233.637 |
| 3, fresh path table | 1200.511 | 667.506 | 692.682 | 233.640 |
| 4, fresh path table | 1231.594 | 638.371 | 695.181 | 260.322 |

First-run total decreased about 24%, and field computation about 41%, in these local measurements. This does not claim a browser latency: root is checking the actual browser while rendering.

Prepared-solver oracle regression was recorded RED before implementation, then GREEN. Fresh complete suite at 10:38:48: **46/46 tests passed**, including independent oracle paths, complex individual-field summation, and invalidation checks. `npx tsc -b` passed. Numerical payload size and all displayed physical metrics are unchanged apart from floating-point roundoff at approximately 1e-15. No numerical approximation, grid reduction, or further performance refactor was introduced.

## Optimizer objective correction, 10:51

The initial implementation maximized target pressure alone and did not fulfill the approved target-to-off-target objective. It now uses the coarse in-plane ratio defined above for the initial pose and every valid candidate, reusing the prepared propagation tables and fixed-energy focusing sequence. The best reported objective is no worse than the initial objective. Candidate records retain both the ratio score and exact target pressure. A plane with no eligible off-target brain sample fails early with an intelligible error. No propagation mode is silently changed.

Independent tests compute the ratio from sampled fields and exact target pressure without calling the optimizer's scoring implementation. They check initial, final, and a candidate score, and preserve homogeneous and uncorrected modes in addition to corrected mode. The initial RED test demonstrated a reported 7.943339 dB target-only score versus the independently expected 12.557374 dB ratio for its rotated input. An empty eligible mask also failed RED before the fix. Cached Float32 amplitudes require a 5e-6 dB score comparison tolerance.

At 10:51:01, the full suite passed **51/51 tests across eight files**; TypeScript checks passed. Default search: **12.438509 → 13.453628 dB**, 27 candidates, selected radius **112 mm**, rotation **[0.14, 0.14, 0] rad**, target pressure **2.633234 relative units**, corrected mode retained.

Measured search time varied by harness: approximately 0.46 s in the warmed Vitest process, 3.057 s in a fresh Vite SSR process, and 3.299 s in Vite SSR immediately after a 633.676 ms default simulation. These measurements include yielding between candidates and are not presented as actual-browser latency. The root's browser check is the source for browser responsiveness claims.
