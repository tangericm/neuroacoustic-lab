# Reproducible scientific references

`oracle.py` is an independent NumPy float64/SciPy J1 implementation of the app's straight-ray model: analytic nested ellipsoid intersections, segment travel times and attenuation, direction-dependent normal-incidence pressure transmission, finite circular piston directivity, inverse-distance pressure spreading, and coherent complex summation. It does not import JavaScript. `generate_golden.py` writes 36 path cases, 9 complex fields spanning all three modes, and Bessel-directivity samples to `public/reference/golden.json`. Those fixture inputs are self-contained; their ellipsoid radii differ from the interactive default.

`generate_fullwave.py` actually runs the official k-Wave 3-D k-space pseudospectral solver, then writes a compact frozen reference to `public/reference/fullwave.json`. This is a different, expressly stated geometry from the interactive ellipsoidal head: sixteen tilted circular discs (1.5 mm radius), placed on a 40 mm spherical cap with 18 mm aperture radius, targeting (3, 0, 50) mm. The domain is 50 × 50 × 80 mm. The slab case has water below z=22 mm, 6.5 mm of compressional bone, then brain. All sixteen element weights are 0.25, so sum of squared channel weights is 1. The rasterized source's integrated physical area is held constant as spacing changes. This controls the commanded drive; heterogeneous loading and radiated acoustic power are not measured.

## Reproduce on Windows

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r reference/requirements-lock.txt
.\.venv\Scripts\python.exe -m reference.generate_golden
.\.venv\Scripts\python.exe -m reference.generate_fullwave --backend python --device gpu --force
.\.venv\Scripts\python.exe -m pytest -q
npm test
```

The GPU reference was executed on NVIDIA GeForce RTX 5080, driver 576.88, Python 3.13.7, k-Wave-python 0.6.3rc1, CuPy CUDA12 14.2.0, NumPy 2.2.6 and SciPy 1.15.3. Full-wave state arrays use float32; fitting, comparison metrics and the independent oracle use float64. The supplied CUDA13 C++ binary could not run with this installed driver, so no driver changes were made and the successful implementation used the official Python/CuPy solver. `--device cpu` uses the same Python solver with NumPy, at a considerably higher runtime. `--backend cpp` exists as an optional alternate execution path, but was not successfully run on this machine and is not the provenance of the delivered results.

Raw run caches live under ignored `.work/fullwave/`. Always use `--force` after changing geometry, backend, solver, source generation or physical assumptions. Without it, the script reuses the cached numerical runs for inexpensive packaging. The checked-in JSON includes timings, grid/time steps, source voxel counts, numerical material assumptions, source hashes, versions and primary-source links. No cloud service or dataset is needed to view the saved fixtures.

## What was measured

Six actual runs: free water at 0.625 and 0.5 mm; slab with homogeneous-water delays at both spacings; slab with straight-ray travel-time delays at both spacings. Each run uses 90 microseconds of continuous 500 kHz pressure drive, an eight-cycle smooth ramp, a 12-cell outside PML, CFL 0.2, and sinusoidal least-squares amplitude fitting to the final 20 microseconds. Saved planes are y=0, x in ±20 mm and z=30–70 mm, with z-major / x-fastest flattened arrays. Focal metrics search ±12 mm around the target on this plane. FWHM is the interpolated pressure-amplitude half-maximum width (approximately −6.02 dB pressure, not intensity half-maximum).

Fine-grid measurements (arbitrary pressure units with fixed source drive):

| Case | Target pressure | Focal error | Lateral pressure FWHM |
|---|---:|---:|---:|
| Free water | 0.22340 | 5.025 mm | 4.422 mm |
| Slab, uncorrected | 0.06126 | 10.500 mm | 5.249 mm |
| Slab, straight-ray corrected | 0.06914 | 7.000 mm | 5.569 mm |

The correction increases target pressure by about 1.05 dB in this fixture and reduces focal error, but does not restore a perfect focus. Even free water has a proximal pressure maximum: finite aperture diffraction and inverse-distance spreading shift the pressure peak relative to the geometric focus. Do not describe the free-field maximum as a validation failure or the correction as exact restoration.

Coarse-to-fine normalized plane L2 differences are 6.09% free water, 4.40% uncorrected slab, and 4.16% corrected slab. Target amplitudes change by 3.46%, 1.33% and 1.10%, respectively, relative to the fine result. Focal positions change by 0, 0.515 and 0.177 mm. The coarse raster represents 6.25 mm of bone; the fine raster represents 6.5 mm. These are numerical sensitivity measurements from two spacings, **not evidence of asymptotic convergence** or discretization-independent accuracy.

Ray pressure uses the same finite-disc centres, normals, drive phases, physical coefficients and attenuation at 500 kHz. A single free-water target-amplitude factor per spacing maps ray source units into solver units, and that identical factor is reused for both slab modes. No slab amplitude fit or phase calibration is performed. `normalizedL2Ray` is `norm(fullwave - scaled_ray) / norm(fullwave)` across the saved plane, not a comparison of independently peak-normalized pictures. Free-field amplitude agreement at the target is therefore calibrated, while free-field shape and slab amplitude/shape remain comparisons. Each field retains its real relative pressure magnitude.

## Limits and provenance

- This is a compact planar compressional reference, not a full-head, patient-specific or clinical validation. It cannot establish accuracy of the interactive head geometry.
- k-Wave captures compressional diffraction, refraction and reverberation; the ray approximation does not. Shear waves, elastic mode conversion, CT-derived heterogeneity, nonlinear harmonics, thermal effects and exposure safety are excluded.
- k-Wave uses one power-law exponent across the domain. We use exponent 2 with coefficients chosen to reproduce 6 dB/cm bone and 0.3 dB/cm brain at 500 kHz, and zero water loss. Exponent 2 has zero power-law dispersive term. Broadband bone attenuation and dispersion are not validated.
- Finite duration may retain residual transients; PML thickness and temporal-window convergence were not swept. Voxelized tilted discs and the planar boundary cause discretization error. Reported locations are planar ROI maxima rather than full-volume global maxima.
- Source pressure is not calibrated in pascals. Neither physical radiated acoustic power nor human exposure is estimated.
- The runtime numbers measure solver calls; geometry setup, source construction, ray calculations and JSON packaging are additional work. No performance claim for the browser follows from these GPU timings.

Primary sources: [k-Wave Python documentation](https://k-wave-python.readthedocs.io/en/latest/), [k-Wave Python source](https://github.com/waltsims/k-wave-python), [k-Wave numerical model](http://www.k-wave.org/documentation.php), and [compiled binary release](https://github.com/waltsims/kspacefirstorder-unified/releases/tag/v1.4.2). The delivered solver is k-Wave Python/CuPy, not the compiled binary.

Tests cover analytic layered distances and time, pressure dB conversion, tangent handling, Bessel zero/axis/back hemisphere, constructive delay phase sign, planar travel time/absorption, interpolated Gaussian FWHM, physically plausible free-water focusing, saved data integrity and shared amplitude scaling. The TypeScript suite separately consumes the Python golden fixtures. Passing these checks supports the stated mathematical contracts; it does not certify omitted physics.
