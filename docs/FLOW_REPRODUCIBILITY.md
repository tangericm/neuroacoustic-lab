# Vascular imaging: methods and reproducibility

The recruiter experience connects four reusable processing operations through one fixed synthetic acquisition. It demonstrates deliberate modeling choices and computational reuse. The separate focused-ultrasound movie retains its own head geometry and 500 kHz pulse; it does not supply these imaging measurements.

## Fixed experiment

Seed 1729 produces tissue speckle, two axial calibration tubes with velocities ±40 mm/s, and an original branching network. Independent centerline streams wrap deterministically; they do not enforce fluid conservation or vessel-wall mechanics. Tissue translates +0.43 mm over 62 ms. Scatterers are stationary during each RF acquisition.

| Quantity | Configuration |
|---|---|
| Image plane | x–z, 97×97 pixels, x −20 to +20 mm, z 20 to 60 mm |
| Probe | 32 linear receivers, 0.75 mm pitch, 0.6 mm piston diameter, z=100 mm |
| Transmission | One near-central individual element per frame, divergent wave |
| Slow time | 32 frames, 2 ms spacing |
| Fast time | 8 MHz, 1024 samples, zero time origin |
| Propagation | Homogeneous scalar straight paths, c=1560 m/s |
| Pulse | f₀=1 MHz, Gaussian σ=0.7 µs; amplitude-spectrum FWHM≈536 kHz |
| Noise | Independent frame seeds; fixed RMS 0.002×global noiseless channel peak |
| Clutter rejection | First two temporal modes; fixed before held-out cases |

Positive axial velocity/displacement points toward the probe (+z). Image rows increase toward decreasing z. RF axes are `[slowTime, transmit, receive, fastTime]`. Archived complex arrays are frame/pixel/interleaved real-imaginary, little-endian float32; processing uses float64.

## Why each method is used

1. **Image formation.** `buildDasPlan` caches receiver sample indices and interpolation fractions for every pixel. `applyDasPlan` converts RF to analytic signals and coherently averages interpolated transmit-plus-receive arrivals. The same table serves all frames and component checks. Envelopes are only a display product; complex phase remains available downstream.

   `I(x,k) = (1/N) Σᵣ RFₐ(r, τ_TX(x)+τᵣ(x), k)`

   Here x is image position, k frame index, r receiver, N=32, and τ is path length/c. Directivity and attenuation use the center frequency despite the finite bandwidth. This is single-transmit backprojection, without plane-wave compounding or full-wave solving.

2. **Clutter filtering.** Tissue is stronger and temporally coherent. A Hermitian Gram decomposition identifies its dominant temporal subspace without building a full pixel-space covariance matrix. `filterTemporalSubspace` removes two complex modes; no vessel-truth mask enters the projector.

   `G=XᴴX; GV=V diag(σ²); Y=X(Id−V₂V₂ᴴ)`

   X is pixels×time, H conjugate transpose, σ singular values, V₂ the first two modes, and Y retained I/Q. Slowly moving blood may overlap tissue modes and be removed. Rank two was selected during a disclosed exploratory tube probe, then frozen for the published extra cases.

3. **Flow estimation.** `powerMap` measures mean squared magnitude; `lagOneDoppler` uses interframe complex correlation phase to estimate axial velocity.

   `P=meanₖ|Yₖ|²; R₁=ΣₖYₖ₊₁conj(Yₖ); v_z=c arg(R₁)/(4πf₀Δt)`

   Δt=2 ms gives a ±195 mm/s Nyquist limit. Only pixels above 3% of peak filtered power and coherence≥0.8 are accepted. The view saturates color outside ±60 mm/s while preserving estimates; invalid pixels are gray. This narrow-aperture axial approximation omits transverse velocity and retains angle bias, aliasing, and decorrelation risk.

4. **Tissue displacement.** `trackAxialNcc` branches from **unfiltered** envelopes because tissue rejection would discard its tracking signal. It compares mean-subtracted 9×5 patches, searches ±3 pixels in 0.1-pixel increments, and fits the local correlation peak. Low variance, boundary peaks, confidence<0.8, and ambiguous peaks are rejected.

   `NCC(d)=Σ[(A−Ā)(B_d−B̄_d)]/√[Σ(A−Ā)²Σ(B_d−B̄_d)²]`

   A is the first patch, B_d a shifted last-frame patch, and bars patch means. Physical shift is −d×pixel pitch. The display magnifies estimated arrows ×20. The method assumes local rigid axial translation; it estimates neither strain nor out-of-plane motion.

Source disclosures are extracted at build time from these actual TypeScript exports, with links to their source files. Visitors see frozen output rather than running these numerical functions.

## Validation and limitations

An independent NumPy/SciPy implementation starts from archived RF, computes analytic channels and geometry-derived delays, performs a full complex SVD, and checks retained power, lag-one velocity, and validity masks. It does not independently validate the acoustic forward model or NCC. NCC is checked against prescribed and held-out trajectories.

| Main-case measurement | Result and scope |
|---|---|
| Complex I/Q agreement | Relative L2 2.724×10⁻⁸ |
| Filtered I/Q agreement | Relative L2 8.194×10⁻⁸ |
| Velocity/mask agreement | Max accepted-pixel error 2.22×10⁻⁹ m/s; zero mask disagreements |
| Tissue rejection | 33.64 dB; same learned projector applied to tissue-only oracle |
| Blood retention | 91.73% component energy; not detection sensitivity |
| Tube velocity error | MAE 5.155 mm/s on valid guarded tube interiors; coverage 30.82% |
| Tissue tracking | Median absolute error 12.72 µm on 96 defined background windows |

Truth masks define evaluation regions only. Known-component energy checks apply the **mixed-data** projector to separately simulated tissue/blood/noise components. A noise-only probe uses that projector and the original absolute validity gates. Plot arrows/overall valid patches and the narrower background evaluation windows have different scopes.

Two held-out seeds include non-grid positive/negative tissue shifts and increased receiver noise. A deliberately slow 2 mm/s blood case retains only about 7.3% blood energy and 8.7% tube coverage, documenting tissue/blood subspace overlap. These are fixed sensitivity checks, not population or clinical validation. Reports retain all cases and scoped errors.

## Reproduce

Install Node dependencies and Python NumPy/SciPy/pytest. The generator invokes `python` from PATH:

```sh
npm ci
python -m pip install numpy scipy pytest
npm run generate:flow
python reference/flow_oracle.py --check
npm test
python -m pytest tests/python -q
npm run build
```

The generator records configuration, seed, model version, actual processing timings, archive SHA-256, and source hashes. Source hashes canonicalize UTF-8 CRLF to LF; archive hashes use raw bytes. Numerical contents are deterministic, while generation timestamps and measured timings vary. Regenerate after changing hashed scientific sources.

- `public/demo/flow.json`: browser display output, 916,281 bytes (307,785 bytes in local gzip measurement).
- `public/demo/flow-validation.json`: oracle agreement, main/held-out/failure checks, source hashes, timing scopes.
- `reference/flow_manifest.json`: axis/encoding contract, accepted-pixel masks, derived arrays, archive hashes.
- `reference/flow_{rf,iq,filtered}.f32.gz`: about 8.48 MB combined, reproduction only; never fetched by the default UI.

Generation timings are offline Node/Python measurements, **not browser latency**. Fixed browser playback avoids RF simulation and eigensolver work; no new sustained FPS or memory benchmark is claimed.

## Interface verification

On 2026-10-12, local production-preview checks in the Codex in-app browser exercised all four stages, actual-code disclosure, finite cine completion, and bottom Next navigation. Desktop viewport was 1365×1000; phone viewport 370×844. Phone plots stacked, equations wrapped, code scrolled within its pane, and document width matched scroll width. Next focused the new heading and brought step navigation near the viewport top. The focus Methods target measured 44 px. Captured console warnings/errors were empty. Unit coverage also checks hidden/offscreen/reduced-motion playback cleanup, malformed-fixture retry, shared scales, invalid-pixel masks, and opposite flow arrows.

The final local gates passed 101 JavaScript tests, 18 Python tests, and the strict TypeScript/Vite build. [The Impeccable/Taste audit](FLOW_DESIGN_AUDIT.md) records its bounded design evidence and limitations. No physical-device touch, screen-reader, cross-engine certification, or new runtime benchmark is implied.

## Primary methodological references

- [Field II moving-scatterer flow example](https://www.field-ii.dk/examples/flow_example/flow_example.html)
- [Demené et al., spatiotemporal SVD clutter filtering](https://pubmed.ncbi.nlm.nih.gov/25955583/)
- [Kasai et al., complex autocorrelation flow imaging](https://onlinelibrary.wiley.com/doi/10.1002/scj.4690191102)
- [Mirzaei et al., normalized cross-correlation displacement estimation](https://arxiv.org/abs/1804.05305)

These sources motivate the method families; they do not validate this synthetic fixture or imply knowledge of Merge Labs' private implementation.
