# Vascular imaging: methods and reproducibility

The recruiter experience connects four reusable processing operations through one fixed synthetic acquisition. It demonstrates deliberate modeling choices and computational reuse. The separate focused-ultrasound movie retains its own head geometry and 500 kHz pulse; it does not supply these imaging measurements.

## Fixed experiment

Seed 1729 produces tissue speckle, two axial calibration tubes at x=−15 and −7 mm (radius 1.65 mm) with velocities ±40 mm/s, and an original seven-segment branching network on the right. The tree uses axial and modestly oblique segments so its axial Doppler component remains observable. Independent centerline streams wrap deterministically; they do not enforce fluid conservation or vessel-wall mechanics. Tissue translates +0.43 mm over 126 ms. Scatterers are stationary during each RF acquisition.

| Quantity | Configuration |
|---|---|
| Image plane | x–z, 97×97 pixels, x −20 to +20 mm, z 20 to 60 mm |
| Probe | 64 linear receivers, 0.35 mm pitch, 0.3 mm piston diameter, z=85 mm |
| Transmission | One near-central individual element per frame, divergent wave |
| Slow time | 64 frames, 2 ms spacing |
| Fast time | 16 MHz, 2048 samples, zero time origin |
| Propagation | Homogeneous scalar straight paths, c=1560 m/s |
| Pulse | f₀=2 MHz, Gaussian σ=0.35 µs; amplitude-spectrum FWHM≈1071 kHz |
| Attenuation | Chosen phantom coefficient 0.5 dB/cm/MHz; not a measured tissue property |
| Depth gain | Same geometry-only two-way spreading/attenuation correction in every frame |
| Noise | Independent frame seeds; fixed RMS 0.002×global noiseless channel peak |
| Clutter rejection | First two temporal modes; fixed before held-out cases |

Positive axial velocity/displacement points toward the probe (+z). Image rows increase toward decreasing z. RF axes are `[slowTime, transmit, receive, fastTime]`. Archived complex arrays are frame/pixel/interleaved real-imaginary, little-endian float32; processing uses float64.

## Why each method is used

1. **Image formation.** `buildDasPlan` caches receiver sample indices and interpolation fractions for every pixel. `applyDasPlan` converts RF to analytic signals and coherently averages interpolated transmit-plus-receive arrivals. The same table serves all frames and component checks. Envelopes are only a display product; complex phase remains available downstream.

   `I(x,k) = g(z)/N Σᵣ RFₐ(r, τ_TX(x)+τᵣ(x), k)`

   Here x is image position, k frame index, r receiver, N=64, and τ is path length/c. Directivity and attenuation use the center frequency despite the finite bandwidth. This is single-transmit backprojection, without plane-wave compounding or full-wave solving. A fixed row gain compensates nominal two-way spreading and attenuation: `g(z)=(d/d_ref)^2 × 10^[2(d−d_ref)100α(f)/20]`, where `d=probeZ−z`, `d_ref=probeZ−centerZ`, and `α(f)=0.5 f_MHz` dB/cm. This does not use vessel positions, is identical for every frame/component, and amplifies deep noise. Off-axis directivity and oblique path losses are not exactly compensated.

2. **Clutter filtering.** Tissue is stronger and temporally coherent. A Hermitian Gram decomposition identifies its dominant temporal subspace without building a full pixel-space covariance matrix. `filterTemporalSubspace` removes two complex modes; no vessel-truth mask enters the projector.

   `G=XᴴX; GV=V diag(σ²); Y=X(Id−V₂V₂ᴴ)`

   X is pixels×time, H conjugate transpose, σ singular values, V₂ the first two modes, and Y retained I/Q. Slowly moving blood may overlap tissue modes and be removed. Rank two was selected during a disclosed exploratory tube probe, then frozen for the published extra cases.

3. **Flow estimation.** `powerMap` measures mean squared magnitude; `lagOneDoppler` uses interframe complex correlation phase to estimate axial velocity.

   `P=meanₖ|Yₖ|²; R₁=ΣₖYₖ₊₁conj(Yₖ); v_z=c arg(R₁)/(4πf₀Δt)`

   Δt=2 ms gives a ±97.5 mm/s Nyquist limit. Only pixels above 3% of peak filtered power and coherence≥0.8 are accepted. The view saturates color outside ±60 mm/s while preserving estimates; invalid pixels are gray. This divergent-transmit axial approximation omits transverse velocity and retains angle bias, aliasing, and decorrelation risk.

4. **Tissue displacement.** `trackAxialNcc` branches from **unfiltered** envelopes because tissue rejection would discard its tracking signal. It compares mean-subtracted 9×5 patches, searches ±3 pixels in 0.1-pixel increments, and fits the local correlation peak. Low variance, boundary peaks, confidence<0.8, and ambiguous peaks are rejected.

   `NCC(d)=Σ[(A−Ā)(B_d−B̄_d)]/√[Σ(A−Ā)²Σ(B_d−B̄_d)²]`

   A is the first patch, B_d a shifted last-frame patch, and bars patch means. Physical shift is −d×pixel pitch. The display magnifies estimated arrows ×20. The method assumes local rigid axial translation; it estimates neither strain nor out-of-plane motion.

Source disclosures are extracted at build time from these actual TypeScript exports, with links to their source files. Visitors see frozen output rather than running these numerical functions.

## Validation and limitations

An independent NumPy/SciPy implementation starts from archived RF, computes analytic channels and geometry-derived delays, performs a full complex SVD, and checks retained power, lag-one velocity, and validity masks. It does not independently validate the acoustic forward model or NCC. NCC is checked against prescribed and held-out trajectories.

| Main-case measurement | Result and scope |
|---|---|
| Complex I/Q agreement | Relative L2 2.709×10⁻⁸ |
| Filtered I/Q agreement | Relative L2 7.732×10⁻⁸ |
| Velocity/mask agreement | Max accepted-pixel error 8.331×10⁻¹⁰ m/s; zero mask disagreements |
| Tissue rejection | 24.11 dB; same learned projector applied to tissue-only oracle |
| Blood retention | 99.53% component energy; not detection sensitivity |
| Tube velocity error | MAE 3.781 mm/s on valid guarded tube interiors; coverage 98.26% |
| Reconstructed tube profile widths | 2.083 / 3.750 mm FWHM of z=30–50 mm averaged retained-power profiles; 0.417 mm bins, not a point-source PSF |
| Branch power contrast | Seven branch interiors: 8.45–11.38 dB above guarded right-half background; 100% accepted interior pixels |
| Geometry diagnostic | Maximum 11.76% relative axial sensitivity deficit in evaluated tube pixels; unweighted receive-direction mean, not a correction |
| Tissue tracking | Median absolute error 4.63 µm on 96 defined background windows |

Truth masks define evaluation regions only. Known-component energy checks apply the **mixed-data** projector to separately simulated tissue/blood/noise components. A noise-only probe uses that projector and the original absolute validity gates. Plot arrows/overall valid patches and the narrower background evaluation windows have different scopes.

Two held-out seeds include non-grid positive/negative tissue shifts and increased receiver noise. The positive-shift case gives 99.50% tube coverage; the higher-noise negative-shift case drops to 43.21%. A deliberately slow 2 mm/s blood case retains 38.40% blood energy and 48.07% tube coverage, documenting tissue/blood subspace overlap. The longer 126 ms observation preserves more slow blood than the earlier 62 ms fixture, while still losing over half its energy. These are fixed sensitivity checks, not population or clinical validation. Reports retain all cases and scoped errors. Noise-only accepted fraction is zero under these gates; it is not a false-positive rate for mixed tissue, where residual clutter and off-vessel accepted pixels remain. Branch interiors are within 0.6 times each radius, z=25–55 mm; right-half background excludes every vessel radius plus 2 mm. Shared junction pixels can occur in both branch evaluations.

Four bounded acquisition configurations were inspected on the new phantom: the original 32-receiver/1 MHz acquisition, 64-receiver/2 MHz, 64-receiver/2.5 MHz, and 2 MHz with explicit phantom attenuation plus depth gain. Higher-frequency probes with inherited quadratic brain attenuation lost deep branches and were rejected. A final 32-to-64-frame confirmation improved temporal continuity and was retained. The new-phantom baseline tube-profile widths were 5.0/5.0 mm; final widths are 2.083/3.750 mm. This comparison changes acquisition, attenuation, depth gain and observation duration together; it does not isolate aperture or frequency effects and is distinct from the prior released phantom. Tissue rejection decreased from 34.39 dB in that baseline to 24.11 dB; sharper widths do not imply universally better clutter contrast. No truth stencil, branch mask, or drawn vessel supplies estimated power or velocity.

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

- `public/demo/flow.json`: browser display output, 990,146 bytes (353,974 bytes in local gzip measurement).
- `public/demo/flow-validation.json`: oracle agreement, main/held-out/failure checks, source hashes, timing scopes.
- `reference/flow_manifest.json`: axis/encoding contract, accepted-pixel masks, derived arrays, archive hashes.
- `reference/flow_{rf,iq,filtered}.f32.gz`: about 40.85 MB combined, reproduction only; never fetched by the default UI.

Generation timings are offline Node/Python measurements, **not browser latency**. Fixed browser playback avoids RF simulation and eigensolver work; no new sustained FPS or memory benchmark is claimed.

## Interface verification

On 2026-10-12, initial production-preview checks in the Codex in-app browser exercised all four stages, actual-code disclosure, finite cine completion, and bottom Next navigation. Desktop viewport was 1365×1000; phone viewport 370×844. Phone plots stacked, equations wrapped, code scrolled within its pane, and document width matched scroll width. Next focused the new heading and brought step navigation near the viewport top. The focus Methods target measured 44 px. Captured console warnings/errors were empty.

The subsequent vessel refinement preserves those four stages and adds looping playback. New desktop/phone captures verify the parallel tubes and connected tree; the phone document remains 355 px wide with a 355 px scroll width. The cine remained playing across multiple cycles and paused on command. Tests check focus/flow wraparound, Replay, pause, hidden/offscreen behavior, stage changes, reduced motion, unmount cleanup, malformed-fixture retry, shared scales, invalid-pixel masks, and opposite flow arrows. The updated slow-flow regression checks retention below half of blood energy and coverage below half of the main case; the independently verified numerical results remain published.

The refined local gates passed 104 JavaScript tests, 18 Python tests, and the strict TypeScript/Vite build. [The Impeccable/Taste audit](FLOW_DESIGN_AUDIT.md) records its initial bounded design evidence and the follow-up scope. No physical-device touch, screen-reader, cross-engine certification, or new runtime benchmark is implied.

## Primary methodological references

- [Field II aperture and point-spread-function examples](https://field-ii.dk/examples/psf_example/psf_example.html)
- [Field II moving-scatterer flow example](https://www.field-ii.dk/examples/flow_example/flow_example.html)
- [Demené et al., spatiotemporal SVD clutter filtering](https://pubmed.ncbi.nlm.nih.gov/25955583/)
- [Kasai et al., complex autocorrelation flow imaging](https://onlinelibrary.wiley.com/doi/10.1002/scj.4690191102)
- [Mirzaei et al., normalized cross-correlation displacement estimation](https://arxiv.org/abs/1804.05305)

These sources motivate the method families; they do not validate this synthetic fixture or imply knowledge of Merge Labs' private implementation.
