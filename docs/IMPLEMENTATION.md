# Neuroacoustic Lab implementation ledger

Approved brief: October 14 recruiter demonstration. Curved 64-element array; dark instrument design; live reduced scalar acoustics; channel reconstruction; independent full-wave references. Doppler, SVD, motion, and learned methods are later work.

## Responsibilities and acceptance

1. Numerical core: pure SI-unit contracts, layered paths, fixed-drive delays, RF generation, DAS, metrics, bounded placement optimizer, worker protocol. Analytic tests before implementation.
2. Interface: refined anatomical 3D scene, controls, reconstruction comparison, diagnostics, guided story, methods, exports, stale-result protection.
3. Independent evidence: float64 oracle, frozen fixtures, compact 3D k-Wave runs, convergence and disagreement reporting.
4. Integration and release: automated tests, browser inspection, measured runtime, documentation, CI, GitHub and Vercel deployment.

Ruling: use one new standalone checkout, as expressly requested, rather than a linked worktree of an unrelated project.
Ruling: coordinate independent core, UI, and offline-reference work through the shared contracts; no shared implementation files between agents.

## Progress

- Core, interface, independent float64 oracle, and six actual 3D k-Wave runs are implemented. Scientific and interface task reviews passed after fixes to input validation, bounded phantom placement, cached solver provenance, renderer fallback, resource ownership, and restoration.
- The whole-project audit found a high-argument directivity cancellation error in accepted shared scenarios. An original NIST DLMF implementation and 134 SciPy fixtures corrected it. Scoped independent review cleared the issue, including a 40,001-point numerical sweep.
- Root verification after that correction: 53 JavaScript tests, 17 Python tests, strict TypeScript, production build, and npm dependency audit passed. Browser checks are recorded in `BROWSER_QA.md`.
- Final browser testing found a Drei loading-overlay teardown error. The final UI change moves atlas status into the outer React DOM tree and starts the walkthrough with uncorrected delays. Scoped review cleared it; fresh production reload, atlas remount, and the correction step produced no new browser errors. Final verification: 55 JavaScript tests and the production build pass, with 17 Python tests passed after the final numerical change. The dependency audit reports zero known vulnerabilities.

## Scientific and implementation rulings

- Selected-element visualizations use actual complex, weighted contributions from the same propagation cache; their sum must equal the coherent pressure map.
- Placement search maximizes a fixed-drive target/off-focus ratio on a disclosed coarse 17 × 17 in-brain plane, with an 8 mm exclusion. It preserves the chosen propagation mode and reports every candidate. Fine-grid or whole-volume sidelobes can rank differently.
- The atlas provides visual context while the rendered ellipsoids define acoustic boundaries. This distinction is visible in the scene and methods.
- The six full-wave fixtures have frozen compact slab geometry and matched amplitude scales. Published disagreements and two-grid sensitivities are evidence for those fixtures, not validation of arbitrary interactive heads.
- Scientific implementation and final audit retained higher-capability models. Bounded documentation and packaging used a lower-tier model, as requested.

## Release

Published on October 12, 2026:

- Source: https://github.com/tangericm/ultrasound-lab
- Production: https://neuroacoustic-lab.vercel.app
- Verified implementation commit: `3c13c1a`; JavaScript asset: `index-BAtRLtqT.js`.
- GitHub CI: https://github.com/tangericm/ultrasound-lab/actions/runs/38288748082 — both browser-core and float64-reference jobs passed on Ubuntu.
- An unauthenticated HTTP request returned 200. The live browser loaded the atlas, computed the default case in 854 ms, and displayed the frozen full-wave comparisons. No new errors or warnings appeared for the deployed origin.
- The live screenshot is retained in `docs/figures/workspace.jpg`.
- Vercel project creation, CLI production deployment, and alias succeeded. The GitHub integration connection failed twice; automatic push deployment is not claimed. GitHub CI remains connected. Future publication uses the linked Vercel CLI until that integration is enabled.

Domain follow-up on October 12: the user connected the GitHub repository. The project API confirms `tangericm/ultrasound-lab`, production branch `main`. The unsuffixed `ultrasound-lab.vercel.app` address was already in use. Added verified production domain `neuroacoustic-lab.vercel.app` to the existing project and configured the initial `ultrasound-lab-six.vercel.app` address to redirect with HTTP 308. Updated the README and GitHub homepage to the new domain. This changes publication metadata and routing; the numerical implementation is unchanged.
