# Phase 3 verification record

Phase 3 was verified on 14 August 2026 in credential-free local mode.

## Automated gates

Run from the repository root:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd audit --audit-level=high
```

Observed results:

- 27 tests passed across six test files.
- `@yange/domain`: 17 tests covering earlier ledgers plus candidate determinism, availability exclusion, reservation idempotency, laundry holdouts, graph separation, and stable clusters.
- `@yange/contracts`: eight tests covering the multimodal boundary plus context validation, stale-weather rejection, explanation failure, and rejection of decision fields smuggled into model output.
- `@yange/web`: two image-pipeline tests remained green.
- Strict TypeScript checks passed in every workspace.
- The production Vite bundle completed successfully.
- The dependency audit reported no high-severity vulnerabilities.

## Browser walkthrough

The following paths were exercised in the in-app Chromium browser:

1. Open **Decision atelier** on a desktop viewport.
2. Open **Laundry Lab**, stage the transparent four-piece demo basket, and commit it.
3. Confirm three recommended wash groups: dark machine-cold, light hand-wash, and light machine-cold.
4. Confirm five visible incompatibility edges and no conflict inside any recommended load.
5. Reload and confirm garment states, readiness, and four Agent Activity entries persist.
6. Reset, generate an outfit with the deliberate explanation outage, and confirm three candidates remain visible with unchanged factor receipts.
7. Confirm exactly one explanation fails while the other two complete.
8. Plan the leading candidate and confirm five real garments become reserved through one outfit event plus five dependency events.
9. Reload and confirm all six events persist in Agent Activity.
10. Reset and switch to a 390 × 844 viewport.
11. Generate all three candidate cards and confirm document width remains equal to viewport width.
12. Inspect browser logs and reset the temporary viewport.

Observed results:

- Four queued pieces became three safe loads with five explained conflict edges.
- Explanation failure affected prose only; generation and reservation stayed operational.
- Outfit planning reserved the exact five candidate dependencies atomically and survived reload.
- Desktop and 390 px layouts had no horizontal document overflow before or after candidate generation.
- Browser console contained no warnings or errors.
- Demo state and the temporary mobile viewport were reset after testing.

## Honest local-mode boundary

Weather and calendar values come from manual adapters implementing production-shaped ports. Explanations come from `fake-gemini-explanation-v1`, a deterministic adapter with deliberate failure injection. This is not represented as live Gemini or live weather. Phase 5 can replace those adapters with Google Cloud implementations without changing the pure decision engines or event commands.

## Care-safety basis

The implementation rationale and authoritative sources are recorded in `docs/phase-3-spec.md`. Yange uses confirmed care-label evidence conservatively, holds unknown care for review, and does not claim to replace a garment's manufacturer instructions.
