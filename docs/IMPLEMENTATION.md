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

- Core, interface, independent oracle, and six full-wave reference runs implemented. Scientific task review passed after input/provenance fixes. Browser QA and interface review are underway before release.
