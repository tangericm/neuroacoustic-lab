# Scalar engine implementation evidence

## Model

SI units. Four nested ellipsoids subtract cumulative scalp, skull, and fluid thickness from each outer semiaxis. Analytic segment/ellipsoid intersections split each straight path into material lengths. Travel time is the sum of length/speed. Pressure includes normal-incidence transmission `2 Z_next / (Z_previous + Z_next)`, center-frequency attenuation `10^(-dB/20)`, spreading normalized to 100 mm, and finite circular-piston directivity `2 J1(ka sin(theta))/(ka sin(theta))`. Back-facing elements contribute zero. Units are relative pressure, not pascals or clinical dose.

Focused continuous-wave fields use sum-squared drive weights exactly one. Corrected delays align actual layered travel times; uncorrected delays use the independently adjustable assumed speed. Homogeneous propagation uses actual brain material parameters throughout the domain, without interfaces. Homogeneous focusing still uses the assumed speed.

RF acquisition is a separate synthetic-aperture sequence: one element emits per shot, with equal shot amplitude `1/sqrt(number of shots)`. The focused CW apodization controls the field, while synthetic-aperture RF uses equal shot drive and uniform DAS receiving. Forward and returning pressure transmission factors use their respective directions. Scatterers occupy a seeded 0.8 mm thin slice with an empty cyst and three point reflectors. Gaussian-modulated RF is sampled at eight samples per carrier cycle. Seeded additive Gaussian noise has RMS equal to the noiseless global RF peak times `10^(noiseDb/20)`.

FFT Hilbert transformation produces analytic channel quadrature. Complex DAS interpolates the same acquired RF and quadrature for either layered delays or homogeneous assumed-speed delays. No ground-truth phantom raster enters reconstruction.

## Metric definitions and limitations

- Target gain compares exact target CW pressure with an uncorrected field through the SAME actual medium; homogeneous mode compares against itself.
- Focal error is distance from the sampled global field maximum to the requested target.
- Lateral focal width is the contiguous count of samples at least half the peak pressure on the row through that maximum, multiplied by pixel spacing. It is a coarse sampled width without crossing interpolation.
- The `sidelobeDb` field is an off-focus maximum outside `max(8 mm, 2 * sampled lateral width)` from the sampled peak. It is not a first-null-defined classical sidelobe level.
- Cyst contrast is mean envelope inside 0.8 cyst radii relative to the 1.2–1.8 radius annulus, expressed with 20log10.
- Point localization searches the strongest reconstruction sample within 12 mm of the known central point. This is a local measured diagnostic, not unconstrained detection accuracy.
- `numericBytes` counts returned typed-array payloads. It excludes JavaScript objects, transient FFT arrays, and the retained single-entry propagation cache (approximately 7.1 MB at default grid/array).
- Optimization searches 27 bounded radius/rotation poses and maximizes exact target CW pressure at constant drive energy. It is a local deterministic enumeration, not a global design optimum. It yields between candidates; the UI may terminate a worker to cancel synchronous simulation.

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
