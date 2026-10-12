# Fixed visual demo release checks

Checked October 12, 2026 on the local Windows workstation in the Chromium-based Codex in-app browser, using the production Vite preview. Desktop viewport 1365 × 1000; phone layout 370 × 844. These checks do not certify other browsers or physical phones.

- Default route presents two clearly separated experiences without target, material, geometry, or acquisition inputs. The fixed 64-element array, brain atlas, acoustic outlines, amber target, and pulse-envelope slice render together.
- Replay starts a finite eight-second pass through 120 microseconds of model time. A paused 40.5-microsecond frame remained stable; completion holds the explicitly labeled 77.5-microsecond target-neighborhood snapshot. Orbiting changes the camera only.
- Imaging displays real RF traces from its separate four-transmit/32-receiver acquisition. Arrival markers differ before alignment and share time zero afterward. Receiver stages build through 1, 2, 4, 8, 16, 24, and 32 receivers. The final partial equals the full calibrated reconstruction.
- The deliberate 1450 m/s timing error and matched 1560 m/s reconstruction share RF and display scale. Known point markers agree with the calibrated image. These are synthetic scatterers, not reconstructed brain anatomy.
- Phone traces redraw at the available width with readable channel IDs and time units. Images and controls stack; document scroll width equals the 370-pixel viewport. Technical details remain collapsed by default.
- The advanced link loads the original simulator. Its brand link returns to the visual demos. Legacy scenario-hash routing is covered by the route tests.
- Component tests cover reduced-motion static presentation, explicit replay, paused/completed render chains, document visibility, intersection visibility, queued-callback cleanup, renderer-construction failure, and context loss. A failed 3D view keeps imaging accessible. Operating-system reduced motion and physical GPU loss were not induced during browser inspection.
- Fixtures record model version, seed, configuration, assumptions, source hashes, and timings. Source hashes normalize CRLF to LF; binary hashes use original bytes. The coherent-envelope raster is an approximate display of the ray model, with its spatial and temporal sampling discrepancies published in `public/demo/display-sampling-report.json`.

The default view uses cached data and creates no numerical worker. Focus-frame decoding retains 14,930,432 bytes; the gzip asset is 3,831,524 bytes. These are fixture-buffer sizes, not whole-tab memory measurements. New default latency and sustained FPS were not benchmarked; the earlier browser timing/FPS results apply to the advanced simulator.

Release gates: 82 JavaScript tests, 17 independent Python reference tests, strict TypeScript, production build, and independent implementation review passed. Final production-origin and CI results are recorded in `docs/IMPLEMENTATION.md`.

Production-origin checks also passed: both experiments rendered; the compressed focus data and imaging JSON match local hashes; page and analytics SDK return HTTP 200. [Retained production screenshot](figures/recruiter-demo.jpg).
