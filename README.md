# Neuroacoustic Lab

[Open the live demo](https://neuroacoustic-lab.vercel.app) · [Validation and reproducibility](docs/REPRODUCIBILITY.md)

An interactive, browser-based demonstration of how array geometry, layered acoustic assumptions, transmit timing, and receive reconstruction affect a synthetic ultrasound experiment. The project connects a 3D array and anatomical context to a deterministic scalar propagation model and a seeded synthetic-aperture acquisition.

This is an educational numerical experiment, not a medical device or a patient-specific prediction. The model does not provide calibrated pressure, exposure, or clinical performance.

## What it includes

- A movable 64-element curved array, layered ellipsoidal medium, target selection, and three propagation/focusing modes.
- Coherent pressure fields, element inspection, harmonic phase playback, and matched synthetic B-mode comparisons from the same seeded phantom and acquired RF channels.
- A bounded, deterministic array-pose search with fixed total squared drive weights.
- A Web Worker simulation path that transfers numeric buffers and rejects stale results; the placement search can be canceled by terminating its worker.
- Scenario JSON download, a shareable URL containing scenario settings, and a comparison-image export. Share links carry settings only; RF and image arrays remain in the browser.
- A Reference view with frozen results from an independent 3D k-Wave fixture.
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

The static build is written to `dist/` and can be deployed to Vercel as a Vite project with `npm run build` and `dist` as the output directory. The application uses a single static entry page and hash-based scenario links. A GitHub-to-Vercel connection can publish the site on pushes; publication is a separate deployment action.

## Model and evidence

The interactive engine uses SI units internally and a scalar, coherent, straight-path model through nested ellipsoidal scalp, skull, fluid, and brain layers. It accounts for travel time, attenuation, normal-incidence pressure transmission, geometric spreading, and a finite circular-piston directivity approximation. Synthetic RF is generated from a seeded speckle-and-point phantom with a cyst, then reconstructed by analytic-signal delay-and-sum. Transmit, receive, and fast-time channel axes are recorded explicitly.

It omits refraction, diffraction beyond the element approximation, shear and mode conversion, multiple scattering, reverberation, nonlinear propagation, broadband material dispersion, and CT-calibrated tissue properties. The atlas mesh supplies visual context; it does not define acoustic boundaries. Pressure is in relative or arbitrary units, not pascals. The interface and material values are not calibrated for clinical use or human exposure.

The independent NumPy/SciPy float64 oracle checks the same straight-ray model against the TypeScript engine; that is numerical verification of shared assumptions, not physical validation. A separate set of six actual k-Wave 3D full-wave runs compares a compact planar water/bone/brain fixture with ray calculations. At the fine 0.5 mm spacing, straight-ray delay correction raised target pressure by about 1.05 dB and moved the planar focus error from 10.5 mm to 7.0 mm. The fine-grid free-water plane has about 5.2% normalized L2 disagreement with the ray model; the corrected slab plane has about 41.4%. The 0.625 mm and 0.5 mm comparison is a two-grid sensitivity check, not evidence of asymptotic convergence. This compact slab fixture does not validate the interactive head geometry.

In local measurements on an RTX 5080 system, a fresh-process Node simulation took about 595 ms; production-browser preview measured about 830 ms cold and 525–741 ms on subsequent default updates. Development-browser measurements were about 491 ms warm and 959 ms after a target change. Rendering sampled 57–60 FPS over one-second windows. These are bounded snapshots, not guaranteed latency or sustained frame-rate claims. Returned typed-array payload is 7,332,864 bytes (about 7 MiB), excluding an approximately 7.1 MB retained path cache. See [browser checks](docs/BROWSER_QA.md) for exercised interactions and device scope.

See [docs/REPRODUCIBILITY.md](docs/REPRODUCIBILITY.md) for commands, fixture provenance, hashes, and evidence scope. The implementation contract and metric definitions are in [src/core/IMPLEMENTATION.md](src/core/IMPLEMENTATION.md).

## Licensing and attribution

The application code in this repository is licensed under MIT; see [LICENSE](LICENSE). That license does not apply to third-party materials. The anatomical `public/models/brain.glb` and its derived metadata are separately licensed CC BY-SA 4.0; attribution and the retained source license are in `public/models/ATTRIBUTION.md` and `public/models/SOURCE-LICENSE.txt`. The asset comes from the Brain Project and is derived from Z-Anatomy and BodyParts3D/DBCLS. Vendored Draco decoder files are Apache 2.0, and Three.js is MIT; see `public/draco/ATTRIBUTION.md` and the decoder's retained notices.

## Static deployment

For a manual Vercel deployment, import the GitHub repository, select the Vite framework preset, set the build command to `npm run build`, and set the output directory to `dist`. No server-side runtime or account backend is required.

The production demo is published at [neuroacoustic-lab.vercel.app](https://neuroacoustic-lab.vercel.app). GitHub Actions checks the core, independent Python reference tests, and static build on each push. Vercel is connected to `tangericm/ultrasound-lab` with `main` as the production branch, so pushes also trigger production deployments. The original `ultrasound-lab-six.vercel.app` address redirects to the current domain.
