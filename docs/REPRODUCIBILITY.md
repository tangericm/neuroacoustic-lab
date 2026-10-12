# Reproducibility and evidence

This project reports two distinct forms of numerical evidence. The Python float64 oracle independently implements the browser model and checks its mathematical calculations. The full-wave fixtures run a separate 3D k-Wave solver on a compact planar geometry. Agreement with the oracle verifies implementation consistency under shared assumptions; the full-wave comparison probes selected effects omitted by the scalar model. Neither is patient-specific or clinical validation.

## Reproduce the application checks

Install the locked JavaScript dependencies and run the app checks from the repository root:

```sh
npm ci
npm test
npm run build
```

## Reproduce the independent float64 oracle

Python reference dependencies are pinned in `reference/requirements-lock.txt`. On Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r reference/requirements-lock.txt
.\.venv\Scripts\python.exe -m reference.generate_golden
.\.venv\Scripts\python.exe -m pytest -q
npm test
```

`reference.oracle` is a separate NumPy float64/SciPy J1 implementation of nested ellipsoid intersections, straight-path travel times and attenuation, directional normal-incidence pressure transmission, finite-piston directivity, inverse-distance spreading, and coherent complex pressure. `generate_golden` writes 36 path cases, nine complex fields across the three propagation modes, and directivity samples to `public/reference/golden.json`. The fixture inputs are self-contained and use ellipsoid radii that differ from the interactive default. TypeScript tests consume these frozen values.

This is same-model verification: both implementations encode the same scalar straight-ray assumptions. It does not demonstrate that those assumptions describe real cranial propagation.

`tests/core.directivity.scipy.json` adds 134 independent SciPy 1.18.0 values for signed piston directivity `2 J1(x) / x`, covering the large-argument branch, zeros, and the admitted high-frequency domain through `x=40`. The original TypeScript implementation uses the power series below 16 and the NIST DLMF Hankel expansion above it. A separate review against SciPy 1.15.3 sampled 40,001 arguments over `[0,40]` and measured a maximum absolute error of `4.04e-12`; negative-input parity error was zero.

## Reproduce the full-wave fixture

The checked-in `public/reference/fullwave.json` was produced by six actual 3D k-Wave Python/CuPy GPU solver runs. Re-run them with:

```powershell
.\.venv\Scripts\python.exe -m reference.generate_fullwave --backend python --device gpu --force
```

For a CPU run, use `--device cpu`; it uses the same Python solver with NumPy and takes considerably longer. `--backend cpp` is an optional path, but it was not used for the checked-in data. Raw run caches live under ignored `.work/fullwave/`; `--force` ensures a fresh solver run after changing geometry, solver, source construction, or physical assumptions.

The recorded run used NVIDIA GeForce RTX 5080, driver 576.88, Python 3.13.7, k-Wave-python 0.6.3rc1, CuPy CUDA 12 package 14.2.0, NumPy 2.2.6, and SciPy 1.15.3. The supplied CUDA 13 C++ binary could not run with that installed driver, so the delivered provenance is the official Python/CuPy solver. Solver state arrays are float32; fitting, metrics, and the independent oracle use float64. The JSON records configuration, per-run timings and source voxel counts, material assumptions, seed, source hashes, versions, and source links.

The fixture uses a fixed 16-element spherical-cap array of finite 1.5 mm radius discs, 500 kHz drive, and target `(3, 0, 50) mm` in a `50 × 50 × 80 mm` domain. The layered slab comprises water to `z=22 mm`, `6.5 mm` of compressional bone, then brain. Each channel has weight 0.25, keeping the sum of squared weights at one. The six runs are homogeneous water at two spacings, plus the two slab delay modes (water-delay uncorrected and straight-ray corrected) at both 0.625 mm and 0.5 mm spacing. The recorded run used 90 μs drive, an eight-cycle smooth ramp, 12-cell outside PML, CFL 0.2, and a sinusoidal least-squares amplitude fit over the final 20 μs.

At 0.5 mm spacing, the saved planar measurements are:

| Case | Target pressure (arbitrary units) | Planar focus error | Lateral pressure FWHM |
| --- | ---: | ---: | ---: |
| Homogeneous water | 0.22340 | 5.025 mm | 4.422 mm |
| Slab, uncorrected delays | 0.06126 | 10.500 mm | 5.249 mm |
| Slab, straight-ray corrected delays | 0.06914 | 7.000 mm | 5.569 mm |

Correction raises target pressure by about 1.05 dB and reduces focus error; it does not restore a perfect focus. Normalized L2 is `norm(fullwave − scaled ray) / norm(fullwave)`: at 0.5 mm spacing, the free-water plane differs from the ray model by 5.21%, the uncorrected slab by 46.08%, and the corrected slab by 41.36%. A single free-water target-amplitude factor per grid spacing scales the ray model into solver units and is reused for both slab modes; no slab amplitude or phase fit is made. Thus the free-water target amplitude is calibrated, while the field shape and slab comparisons are not independently peak-normalized.

Comparing the 0.625 mm and 0.5 mm grids gives normalized plane L2 differences of 6.09% (water), 4.40% (uncorrected slab), and 4.16% (corrected slab). Target amplitudes change by 3.46%, 1.33%, and 1.10%; focal positions shift by 0, 0.515, and 0.177 mm, respectively. The rasterized bone is 6.25 mm thick on the coarse grid and 6.5 mm on the fine grid. These two spacings measure numerical sensitivity, not asymptotic convergence or discretization-independent accuracy.

## Scope and limitations

The fixture is a compact planar compressional reference, not a full-head or patient-specific validation. k-Wave captures compressional diffraction, refraction, and reverberation that the ray model omits. Shear waves, elastic mode conversion, CT-derived heterogeneity, nonlinear harmonics, thermal effects, and exposure safety are outside the fixture. One power-law exponent is used across the domain; exponent 2 has no dispersive term. Finite-duration transients, PML thickness, and temporal-window convergence were not swept. The tilted discs and planar interfaces are voxelized, and reported focus locations are maxima within a planar region of interest, not full-volume maxima.

Pressures are arbitrary units; neither pressure calibration in pascals, radiated acoustic power, nor human exposure is estimated. Solver call timings exclude geometry setup, source construction, ray calculations, and JSON packaging. They do not imply browser performance.

## Attribution and source material

- The solver and numerical model references are listed in [`reference/README.md`](../reference/README.md) and embedded in the fixture metadata.
- The anatomical mesh is visual context from the Brain Project, derived from Z-Anatomy and BodyParts3D/DBCLS. See [`public/models/ATTRIBUTION.md`](../public/models/ATTRIBUTION.md) and its retained [`SOURCE-LICENSE.txt`](../public/models/SOURCE-LICENSE.txt); the mesh is CC BY-SA 4.0.
- Vendored Draco decoder notices and attribution are in [`public/draco/ATTRIBUTION.md`](../public/draco/ATTRIBUTION.md). The decoder is Apache 2.0; Three.js is MIT.
- Application source code is MIT under [`LICENSE`](../LICENSE). These code terms do not replace or relicense third-party assets and decoder materials.
