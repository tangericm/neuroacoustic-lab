# Neuroacoustic Lab

[Open the live demo](https://neuroacoustic-lab.vercel.app) · [Flow methods and validation](docs/FLOW_REPRODUCIBILITY.md) · [Acoustic references](docs/REPRODUCIBILITY.md)

Two fixed, browser-based demonstrations explain ultrasound focusing and computational imaging. The focused-ultrasound experience shows a short pulse traveling from a 64-element curved array toward a target in anatomical context. A separate vascular imaging experiment follows synthetic echoes through image formation, clutter rejection, axial flow estimation, and tissue tracking. Both load reproducible precomputed results; the recruiter experience does not start a simulation worker or run an eigensolver.

This is an educational numerical experiment, not a medical device or a patient-specific prediction. The model does not provide calibrated pressure, exposure, or clinical performance.

## What it includes

- **Focused ultrasound:** a fixed 64-element array and target, coherent pulse-envelope playback on an x–z plane, and a 3D anatomical view with Play/Pause and Replay controls.
- **Ultrasound imaging:** Form image → Filter clutter → Measure flow → Track tissue. A separate 64-receiver linear probe records 64 frames, each with one near-central divergent transmission. Two parallel signed-flow tubes sit on the left; a connected branching tree sits on the right, alongside a known tissue displacement.
- Reusable cached delay-and-sum backprojection preserves complex I/Q. A temporal SVD subspace removes two dominant modes; lag-one phase estimates axial blood velocity. Normalized correlation tracks tissue on the original, unfiltered branch. Each stage shows its purpose, equation, variables, assumptions, and expandable code extracted from the actual core functions.
- Before/after power maps share a reference and −40 dB floor. Invalid velocity pixels are gray, with measured power/coherence gates. Truth geometry is shown separately and used for evaluation only. The focused-pulse movie does not generate this imaging acquisition.
- Playback repeats while playing; Pause stops it and Replay returns to the beginning. The imaging cine repeats the same recorded ensemble. Hidden/offscreen suspension and reduced-motion static views remain available.
- An optional [advanced lab](https://neuroacoustic-lab.vercel.app/?view=lab) with movable elements, target and material controls, three focusing modes, element inspection, and a bounded array-pose search at fixed total squared drive weights. Open `?view=lab`; legacy `#s=` scenario links also open the advanced lab.
- The advanced lab retains its Web Worker simulation, transferable numeric buffers, stale-result rejection, cancelable placement search, scenario JSON and image export, and shareable settings URLs. Share links carry settings only; RF and image arrays remain in the browser. Its Reference view contains frozen results from an independent 3D k-Wave fixture.
- Vercel Web Analytics for visit statistics. Page-view URLs have query parameters and scenario hashes removed; there are no custom events carrying model settings, RF channels, or images.

## Run locally

Requirements: Node.js with npm. Python is optional and needed only to reproduce the scientific reference fixtures.

```sh
npm ci
npm run dev
```

Vite prints the local address. To create the static production bundle or run the JavaScript test suite:

```sh
npm run build
npm test
```

The static build is written to `dist/` and can be deployed to Vercel as a Vite project with `npm run build` and `dist` as the output directory. The application uses a single static entry page; `?view=lab` and legacy hash-based scenario links select the advanced lab. A GitHub-to-Vercel connection can publish the site on pushes; publication is a separate deployment action.

The fixed demo assets are checked into `public/demo/`. To regenerate them after changing their source model or fixture configuration:

```sh
npm run generate:demo
npm run generate:flow
npm test
npm run build
```

[`scripts/generate-demo.mjs`](scripts/generate-demo.mjs) runs [`src/demo/generate-fixtures.ts`](src/demo/generate-fixtures.ts) against the TypeScript core. The fixture metadata records the model version, seed, generation time, assumptions, and SHA-256 hashes of UTF-8 source files with CRLF normalized to LF. [`public/demo/generation-report.json`](public/demo/generation-report.json) records generated asset sizes, raw binary hashes, and amplitude saturation counts. Regeneration is a development step; visitors load the frozen results.

`generate:flow` uses Python with NumPy/SciPy to run the independent oracle after TypeScript fixture generation. Its configuration, source hashes, held-out checks, and timings are recorded in `public/demo/flow-validation.json` and `reference/flow_manifest.json`. See [flow reproduction commands](docs/FLOW_REPRODUCIBILITY.md).

The focus movie contains 241 nonnegative envelope frames at 176 × 176 pixels, encoded in signed-int16 containers: 14,930,432 bytes (14.93 MB) decoded, delivered as a 3,831,524-byte (3.83 MB) gzip file plus about 21 KB of metadata. The refined flow JSON is about 0.99 MB (0.35 MB when gzip-compressed locally). Its eight displayed cine frames keep browser downloads small despite a longer acquisition. The three flow RF/IQ/filter reference archives total about 40.85 MB and are **not downloaded by the browser**. The previous `imaging.json`/`imaging-rf.f32.gz` comparison remains archived and is no longer routed in the recruiter experience. These are asset sizes, not total application download or memory measurements.

The movie shows the magnitude **after** coherent complex summation, preserving interference while avoiding an undersampled carrier animation. All frames use the same scale. The [display sampling report](public/demo/display-sampling-report.json) compares interpolation against a denser version of the same ray model: spatial envelope differences remain approximately 5–19% across four specified snapshots. It is a display-resolution check, not full-wave validation. The [fixed-demo browser checks](docs/RECRUITER_DEMO_QA.md) record release verification.

## Model and evidence

The acoustic core uses SI units internally and a scalar, coherent, straight-path model through nested ellipsoidal scalp, skull, fluid, and brain layers. It accounts for travel time, attenuation, normal-incidence pressure transmission, geometric spreading, and a finite circular-piston directivity approximation. The focus movie adds a finite Gaussian carrier pulse using center-frequency losses and directivity, displaying its coherent envelope with one amplitude scale throughout. Its visible explanation records the 500 kHz carrier, 1.4 µs Gaussian width, calculated 268 kHz amplitude-spectrum FWHM, layer speeds, and ray approximation.

The separate flow experiment uses homogeneous 1560 m/s propagation, a 2 MHz carrier, 16 MHz RF sampling, and 2 ms frame spacing across 126 ms. A chosen phantom attenuation of 0.5 dB/cm/MHz and geometry-only depth gain make deeper branches observable; that gain also amplifies deep noise. Prescribed point scatterers move along synthetic vessel centerlines while tissue translates 0.43 mm. Scatterers are stationary within each echo acquisition. This is coherent point-scatterer transport, not a fluid-dynamics or vessel-wall model. Channel axes and physical origins are explicit; delay tables are shared across frames and component validation. Filtering operates before envelope detection. Doppler estimates only an axial component; tissue tracking is local axial translation, without strain or out-of-plane motion.

The independent flow oracle agrees with TypeScript at relative L2 errors of 2.71×10⁻⁸ for complex beamformed frames and 7.73×10⁻⁸ for filtered frames, with no validity-mask disagreements. In this fixed phantom, measured tissue rejection is 24.11 dB and blood-component energy retention is 99.53%. Valid guarded tube pixels have 3.78 mm/s mean absolute error at 98.26% coverage. Tissue tracking has 4.63 µm median absolute error on the defined background windows. These are scoped synthetic measurements, not clinical accuracy or detection sensitivity. Held-out seeds/noise/translations and a deliberately slow-flow case are published alongside the main result; the latter retains only about 38.4% of blood energy, and the higher-noise case reduces tube coverage to 43.21%. Sharper vessel profiles do not imply universally improved clutter rejection; the reproducibility document records the tradeoffs.

It omits refraction, diffraction beyond the element approximation, shear and mode conversion, multiple scattering, reverberation, nonlinear propagation, broadband material dispersion, and CT-calibrated tissue properties. The atlas mesh supplies visual context; it does not define acoustic boundaries. Pressure is in relative or arbitrary units, not pascals. The interface and material values are not calibrated for clinical use or human exposure.

The independent NumPy/SciPy float64 oracle checks the same straight-ray model against the TypeScript engine; that is numerical verification of shared assumptions, not physical validation. A separate set of six actual k-Wave 3D full-wave runs compares a compact planar water/bone/brain fixture with ray calculations. At the fine 0.5 mm spacing, straight-ray delay correction raised target pressure by about 1.05 dB and moved the planar focus error from 10.5 mm to 7.0 mm. The fine-grid free-water plane has about 5.2% normalized L2 disagreement with the ray model; the corrected slab plane has about 41.4%. The 0.625 mm and 0.5 mm comparison is a two-grid sensitivity check, not evidence of asymptotic convergence. This compact slab fixture does not validate the interactive head geometry.

Historical local measurements of the **advanced lab's simulation path** on an RTX 5080 system recorded about 595 ms for a fresh-process Node simulation, about 830 ms cold in production-browser preview, and 525–741 ms on subsequent updates of the lab's default scenario. Development-browser measurements were about 491 ms warm and 959 ms after a target change. Advanced-lab rendering sampled 57–60 FPS over one-second windows. These are bounded snapshots, not guaranteed latency or sustained frame-rate claims, and do not measure the new default fixed demos. The advanced simulation's returned typed-array payload is 7,332,864 bytes (about 7 MiB), excluding an approximately 7.1 MB retained path cache. See [advanced-lab browser checks](docs/BROWSER_QA.md) for exercised interactions and device scope.

See [docs/REPRODUCIBILITY.md](docs/REPRODUCIBILITY.md) for commands, fixture provenance, hashes, and evidence scope. The implementation contract and metric definitions are in [src/core/IMPLEMENTATION.md](src/core/IMPLEMENTATION.md).

## Licensing and attribution

The application code in this repository is licensed under MIT; see [LICENSE](LICENSE). That license does not apply to third-party materials. The anatomical `public/models/brain.glb` and its derived metadata are separately licensed CC BY-SA 4.0; attribution and the retained source license are in `public/models/ATTRIBUTION.md` and `public/models/SOURCE-LICENSE.txt`. The asset comes from the Brain Project and is derived from Z-Anatomy and BodyParts3D/DBCLS. Vendored Draco decoder files are Apache 2.0, and Three.js is MIT; see `public/draco/ATTRIBUTION.md` and the decoder's retained notices.

## Static deployment

For a manual Vercel deployment, import the GitHub repository, select the Vite framework preset, set the build command to `npm run build`, and set the output directory to `dist`. No server-side runtime or account backend is required.

The production demo is published at [neuroacoustic-lab.vercel.app](https://neuroacoustic-lab.vercel.app). GitHub Actions checks the core, independent Python reference tests, and static build on each push. Vercel is connected to `tangericm/ultrasound-lab` with `main` as the production branch, so pushes also trigger production deployments. The original `ultrasound-lab-six.vercel.app` address redirects to the current domain.
