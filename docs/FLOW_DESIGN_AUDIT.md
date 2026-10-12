# Flow demo interface audit

Audit date: 2026-10-12. Scope: recruiter frame, focused-ultrasound explanation, four imaging steps, actual-source disclosures, fixture loaders, and display mappings. This is a source and supplied-screenshot audit; browser interaction verification belongs to the integration pass.

Follow-up on the same date: the fixed vascular acquisition was refined to show two left-hand tubes and a connected branching tree, with geometry-only depth gain and a longer ensemble. Playback now loops until paused, retaining visibility/reduced-motion safeguards. A separate focused scientific/lifecycle review found no blocking issue; the four-step layout and CSS remain unchanged. New desktop/mobile captures and 104 JavaScript / 18 Python passing tests are recorded in [FLOW_REPRODUCIBILITY.md](FLOW_REPRODUCIBILITY.md). The score and detector result below belong to the initial audit; no new certification or detector pass is implied.

## Implementation integrity verdict

**Pass.** The interface expresses a coherent scientific instrument: real generated numerical images lead each step, purpose and assumptions remain visible, and expandable code comes from the actual reusable TypeScript functions. The brain focus and vascular imaging experiments are explicitly separate. Prescribed phantom geometry is labeled as truth rather than presented as an estimated image. No invented testimonials, clinical claims, decorative metrics, or fake product screenshots were found in the reviewed surface.

The pinned guidance was Impeccable **4.5.2** (`pbakaus/impeccable`, supplied revision prefix `245ad82`) and Taste **v2 experimental** (`Leonxlnx/taste-skill`, supplied revision prefix `d237`). Reviewed local files: `.work/design-skills/pbakaus-impeccable/plugin/skills/impeccable/SKILL.md`, its `reference/audit.md`, and `.work/design-skills/Leonxlnx-taste-skill/skills/taste-skill/SKILL.md`. These are the integration task's pinned upstream revisions, not a claim that this audit independently checked upstream again.

The launcher was initially unavailable in the supplied local checkout, so existing project context was read directly from [FLOW_DEMO_DESIGN.md](FLOW_DEMO_DESIGN.md). Integration subsequently verified the official npm package repository as `pbakaus/impeccable` and successfully ran `npx --yes impeccable@4.5.2 context --target src/demo/FlowImagingDemo.tsx`; it allowed narrow refinement and identified the mixed-project documentation gap. The detector result is tracked separately below. Taste explicitly excludes multistep product/data UI; its contextual portfolio guidance was applied to the recruiter frame, without replacing the incumbent graphite/cyan/amber instrument identity or scientific color scales. Design read: scientific recruiter portfolio, native CSS, variance 4 / motion 3 / density 4.

## Health score

Scores are bounded source/screenshot judgments, not WCAG certification or performance benchmarks.

| Dimension | Score | Evidence and limit |
|---|---:|---|
| Accessibility | 3/4 | Native controls/disclosures, visible focus rules, useful image labels, explicit motion alternatives; selected ordinal contrast corrected. No screen-reader pass. |
| Performance | 3/4 | Frozen results, lazy experience chunks, bounded playback, timer/observer cleanup, no browser eigensolver. No new runtime profile. |
| Theming | 2/4 | Coherent single dark theme and useful tokens; interface surfaces still repeat literal colors. Scientific palette literals are intentional. |
| Responsive design | 3/4 | Fluid plot grids, readable phone equations, contained code scrolling; disclosure target and stage transition confirmed. Physical touch and text zoom remain untested. |
| Implementation integrity | 4/4 | Product-specific data, methods, honest limits, and real code. Official detector returned no findings. |
| **Total** | **15/20** | **Good — bounded fixes, no redesign indicated.** |

## Findings and bounded fix confirmation

Initial findings: **P0: 0 / P1: 1 / P2: 2 / P3: 0**. All three were fixed in one integration batch and confirmed by source, supplied final captures, and the integration browser checks below. **Open findings: P0: 0 / P1: 0 / P2: 0 / P3: 0.** No release-blocking interface issue was found within this audit's coverage. The score stays conservative because detector/screenshot success does not establish comprehensive accessibility, touch, or performance coverage.

### P1 — Selected experience ordinal falls just below normal-text contrast

- **Location:** `src/demo/demo.css:1`, `.recruiter-experiences button > span` and the selected-button background.
- **Category / impact:** Accessibility. The small selected `01`/`02` text uses `#7f959e` on `#19333a`: **4.25:1**, below the 4.5:1 normal-text threshold of WCAG 2.x SC 1.4.3. The meaningful experience label itself passes; user impact is limited to this redundant ordinal, but the audit rubric classifies an AA contrast miss as P1.
- **Fix:** Let the selected button's ordinal inherit its brighter selected text color. Suggested command: `/impeccable harden`.
- **Confirmed resolved:** `demo.css:4` now sets selected ordinals to `color:inherit`; the resulting `#bcf8fa` on `#19333a` is **11.39:1**, and final captures show the brighter selected number.

### P2 — Bottom Next does not orient the reader to the new stage

- **Location:** `src/demo/FlowImagingDemo.tsx:73,88`, `choose()` and the bottom navigation button.
- **Category / impact:** Accessibility / responsive workflow. Source changes stage and stops playback, but does not move focus or scroll to the new stage heading. The next stage's image and purpose replace content above the activated button; a reader can remain near the bottom and must manually return to the new material. This is a source-verified missing transition behavior; the exact mobile scroll result requires integration browser confirmation.
- **Standard:** Predictable keyboard/read-order design; no standalone WCAG failure asserted without interaction evidence.
- **Fix:** After bottom Next/Return, focus a programmatically focusable stage heading and bring it into view, respecting reduced motion. Preserve direct step navigation. Suggested command: `/impeccable harden`.
- **Confirmed resolved:** `FlowImagingDemo.tsx` focuses the updated heading after commit and scrolls the navigation into view with `behavior:'auto'`. Same-stage activation is handled. No animation is forced on reduced-motion users. Integration confirmed bottom Next puts focus on the new `h3`, with the step navigation approximately 18px below the viewport top at both tested sizes.

### P2 — Focus methods disclosure has a small touch target

- **Location:** `src/demo/focus.css:21–22`, `.focus-methods summary`.
- **Category / impact:** Responsive design. A 14px font with inherited 1.7 line height gives approximately 23.8px height without padding; the opening gesture is less forgiving than adjacent 44px controls.
- **Standard:** Impeccable's 44px target guideline / WCAG 2.5.5 enhanced target guidance. This is **not** asserted as a WCAG AA failure; spacing exceptions may apply to the minimum-target criterion.
- **Fix:** Give the summary a 44px minimum hit area while retaining its compact text. Suggested command: `/impeccable adapt`.
- **Confirmed resolved:** `focus.css:22` supplies `min-height:44px` and centers the text in the hit area. Integration measured a 44px summary in the final phone preview.

## Strengths and patterns

- Methods are purposeful and local: one equation, variable definitions, model limit, and optional actual core code per stage. Deeper metrics and provenance use native disclosures.
- Shared power scales, signed velocity limits, invalid-pixel gray, axis units, square-root spectrum scaling, and magnified displacement arrows are explicitly identified. Truth overlays are distinguished from estimates.
- Source-computed sRGB contrast checks pass for representative ordinary text: recruiter secondary text **8.85:1**, flow secondary text **10.51:1**, flow formula text **12.79:1**. These checks do not exhaust every rendered state.
- Flow starts static, ends its cine, and stops for hidden/offscreen/reduced-motion conditions. Focus provides a static reduced-motion state with deliberate replay. Error/loading states preserve the surrounding explanation and controls.
- The recurring maintainability gap is repeated interface color literals across `demo.css`, `focus.css`, and `flow.css`. Consolidate ordinary surface/text/border colors when those styles next change; do not indiscriminately tokenize or alter scientific colormaps. No broad theme rewrite is recommended for this fixed dark surface.

## Evidence and limits

Read source: `RecruiterDemo.tsx`, `FocusedUltrasound.tsx`, `FlowImagingDemo.tsx`, `CoreCode.tsx`, `codeSource.ts`, `loaders.ts`, `flowDisplay.ts`, and their CSS; inspected the fixed experiment design and its numerical assumptions.

Supplied initial desktop captures inspected: `.work/flow-audit-focus-desktop.jpg`, `.work/flow-audit-form-desktop.jpg`, and `.work/flow-audit-filter-desktop.jpg`.

One final bounded confirmation batch from the production preview was inspected: `.work/flow-confirm-{filter-desktop,velocity-desktop,tissue-desktop,form-desktop,code-desktop,filter-mobile,code-mobile,focus-mobile}.jpg`. The integration viewport sizes were 1365×1000 desktop and 370×844 phone; full-page captures include document height and omit scrollbar width. The final images preserve clear scientific labels, correctly show the shared −40dB power display floor, distinguish the tissue branch before filtering, show actual code, and wrap the equations without a page-width overflow in the supplied phone views. The selected number and disclosure fixes remain visually coherent.

The integration browser pass additionally reported: bottom Next focuses the new heading and returns the stage navigation to the top; phone document `scrollWidth == clientWidth` (355/355 with scrollbar, 370/370 for expanded code); source code has its own horizontal scrolling; focus methods hit area is 44px; cine runs to frame 32/32 at 62ms physical time and returns to the Play label; actual source links include `processing.ts#L64`; no error/warning logs were observed. These are attributed integration observations, not actions independently performed by this reviewer.

The root integration task ran the official Impeccable context command and then **one** mechanical detector pass: `npx --yes impeccable@4.5.2 detect --json src/demo`. It exited 0 and returned `[]`; the saved `.work/impeccable-detect.json` was also read for this report. No detector findings required triage; an empty result is not a visual/accessibility certification. Integration separately reported 101 JavaScript tests in 19 files and 18 Python tests passing; this reviewer did not repeat those suites.

Not performed by this reviewer: Lighthouse, injected browser scripts, live browser interaction, physical-device touch, synthesized touch, screen-reader testing, 200% zoom testing, cross-engine certification, or a new performance benchmark. Screenshots establish appearance only, not successful gestures or keyboard behavior. The numerical review is separate from this design score.

## Completed bounded action

1. `/impeccable harden`: selected ordinal contrast and stage-transition orientation — implemented and confirmed.
2. `/impeccable adapt`: focus disclosure hit area — implemented and confirmed.
3. `/impeccable polish`: supplied desktop/mobile captures and the changed controls — the one bounded confirmation is complete. Stop this pass here.

The implementation task already authorizes this fix batch; no additional approval or open-ended audit loop is requested.
