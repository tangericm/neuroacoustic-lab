# Neuroacoustic Lab implementation plan

Goal: an October 14 recruiter demonstration linking array geometry, acoustic propagation, synthetic acquisition, and image reconstruction with explicit quality and computational limits.

## Global constraints

- React/TypeScript/Vite/Three.js/R3F. Static build, no visitor account/backend/Python dependency. WebGL2 baseline; no WebGPU requirement.
- Dark instrument design: graphite, restrained cyan/amber, anatomical context, legible scientific plots.
- Scalar coherent straight-path acoustics, layered ellipsoidal scalp/skull/fluid/brain, attenuation/directivity/geometric spreading/interface transmission. No refraction, multiple scattering, reverberation, shear, nonlinearity, or clinical calibration claims.
- Curved 64-element array. Total squared drive weights fixed at one across comparisons.
- SI units internally. Raw channel axis order transmit/receive/fast-time explicitly recorded.
- Seeded phantom, same raw channels for corrected and homogeneous-delay reconstruction comparisons.
- Independent float64 Python oracle and actual compact 3D k-Wave fixtures. Frozen reference settings and honest discrepancies/convergence, not claimed full-head validation.
- Worker isolation, transferable arrays, stale-result fencing, cancelable placement optimization.
- No personal application files, credentials, or analytics in public source/assets.

## Task 1: Numerical core

Contracts in src/core/types.ts. Produce default scenario, array construction/movement, layered paths, normalized focusing sequence, complex pressure planes, finite pulse echoes, analytic-signal DAS, quality metrics, bounded deterministic placement optimizer, and worker protocol. Tests: analytic paths/attenuation, coherent focusing, drive energy, acquisition timing, linearity, point localization, wrong sound speed, geometry limits. Test first and record evidence.

## Task 2: Browser experience

Consume worker results and shared scenario. Anatomical brain plus matching acoustic shells/array; orbit/zoom/layers/target picking/cutaway; per-element inspection and contributions; physical-time harmonic animation. Matched reconstructed B-mode images with ground truth, RF/delays/profiles and measured runtimes. Inputs, presets, guided story, method limits, JSON/PNG/share exports. Narrow layout, keyboard and reduced-motion behavior. Tests for share/state/stale handling; browser inspection for visuals and interactions.

## Task 3: Independent evidence

Python float64 oracle and frozen golden results independent of TS. Generate 16-element curved-array 500kHz free-field and bone-layer 3D full-wave fixtures with fixed-drive comparisons and resolution refinement. Store small planes/provenance/metrics in public/reference/fullwave.json, not huge solver dumps. Publish mismatches and limits.

## Task 4: Integration and release

Reference panel. Tests bridging TS to frozen float64 data. Verify exports, cancel/reset, rapid changes, without-WebGPU rendering. Measure actual browser numeric time/memory/frame cadence. Aim subsecond default updates and >=30FPS; show progress/quality settings if budgets are missed. Document results and commands. CI, reproducible locked dependencies, Vercel static build, attributed assets. Complete task reviews and whole-project review before GitHub/Vercel release.

## Review focus

- Comparisons must not hide amplitude loss by independently normalizing each pressure field.
- A target or element edit must not display old results with new labels.
- Assumed sound speed must affect focusing/reconstruction without silently changing the actual medium.
- Empty apertures and invalid geometry need finite, intelligible outcomes.
- Reference evidence must come from real solver runs and stay separate from editable-model accuracy claims.
