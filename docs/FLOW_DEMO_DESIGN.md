# Purposeful imaging walkthrough

User brief: preserve the simple recruiter demo, improve wave visibility, and replace the imaging story with reusable image formation, clutter filtering, flow estimation, and tissue displacement methods. Show actual code plus short mathematical explanations, variables, and model assumptions. Use an original vessel phantom inspired by the supplied illustration; do not publish that illustration or personal application documents.

Design read: a scientific portfolio for a recruiter, with a restrained instrument language and native CSS. Preserve graphite/cyan/amber identity and the two existing experience labels. Variance 4, motion 3, density 4; scientific pulse/cine playback is deliberate and bounded. Taste v2 applies to the recruiter-facing frame; its marketing defaults do not govern numerical maps or this processing workflow. Impeccable audit covers the implemented interface.

One fixed, independently identified imaging experiment generates temporally coherent RF and complex delay-and-sum frames. A separate linear imaging probe uses homogeneous propagation, independent noise realizations at a fixed amplitude reference, and one fixed sampling grid. The focusing setup remains unchanged.

Four steps: form an image; remove coherent tissue clutter; measure axial blood flow; track tissue displacement. SVD and Doppler operate on complex frames. Tissue tracking branches from the original frames before clutter rejection. Each step has one clear purpose, a data-derived visual, an equation with variable definitions, a stated limitation, and expandable actual TypeScript core code. Known geometry is evaluation truth, not a stencil for estimated flow.

The shared core exposes a cached DAS plan, complex backprojection, temporal subspace filtering, power/lag-one Doppler, and bounded normalized-correlation tracking. Frozen results keep browser operation light. No new numerical parameter controls, account, backend, or live eigensolver is required. Optional cine playback stops when paused, complete, hidden, offscreen, or reduced motion applies.

Verification includes independent NumPy comparisons, known-component suppression/retention, held-out noise/seeds/non-grid motion, velocity direction and coverage, invalid-result masking, scientific review, UI lifecycle checks, desktop/phone browser inspection, and a final Impeccable/Taste audit. Disagreements and detector/tool limitations are recorded rather than replaced by clinical claims.

Ownership: scientific agent owns new `src/core/flow/*`, flow generation, artifacts, and numerical references/tests. Focus agent owns contrast, wave mathematics, and focus-only tests. Interface agent owns the new flow view/display/CSS/UI tests. Root owns loaders, actual-source presentation, routing integration, documentation, audit synthesis, and GitHub/Vercel delivery. The user's implementation request authorizes these scoped changes and the established release workflow.
