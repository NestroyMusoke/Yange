# Phase 4 verification record

Phase 4 was verified on 14 August 2026 in credential-free local mode.

## Automated gates

Run from the repository root:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd audit --audit-level=high
```

Observed results:

- 36 tests passed across nine test files.
- `@yange/domain`: 22 tests, including five WearCast policy and commit tests.
- `@yange/contracts`: 11 tests, including forecast validation and idempotent notification delivery.
- `@yange/orchestrator`: the full outage, resume, and duplicate-trigger workflow test passed.
- `@yange/web`: the existing two image-pipeline tests remained green.
- Strict TypeScript checks passed in all four workspaces.
- The production Vite bundle and every package build completed successfully.
- The dependency audit reported no high-severity vulnerabilities.

## Browser walkthrough

The following judge journey was exercised in the in-app Chromium browser:

1. Open **WearCast** with clean demo state and confirm zero live risks.
2. Click **Stage 50% risk**.
3. Confirm exactly three of six core clothing pieces are unavailable and Friday Rooftop has two blocked dependencies.
4. Confirm the immutable comparison shows one unresolved commitment under **Do nothing** and zero under **Autopilot**.
5. Confirm Autopilot proposes two care-safe laundry windows and an 85% five-piece fallback.
6. Click **Inject outage**.
7. Confirm forecast acquisition, simulation, and 13 intervention events complete before notification delivery fails.
8. Confirm two laundry interventions, the fallback reservations, and three queued notifications remain committed.
9. Click **Resume paused run**.
10. Confirm the workflow begins at notification delivery, reaches `completed`, records two attempts, and marks all three notifications delivered.
11. Reload and confirm the event ledger, completed workflow receipt, checkpoints, fallback, windows, and outbox survive.
12. Click **Replay exact trigger** and confirm Agent Activity remains at 19 events while `duplicates ignored` changes from zero to one.
13. Switch to 390 × 844, reload the completed experience, and verify seven forecast cards, both scenario cards, and all three notices render without document overflow.
14. Inspect browser logs, reset demo data, reset the temporary viewport, and reload.

Observed results:

- The threshold fired at exactly 50% and the Personal Match engine selected `Indigo & Terracotta After-dark` from currently feasible pieces.
- The best pre-event outdoor opportunity scored 92; rainy and high-risk periods remained marked unsafe.
- Failure was isolated to notification delivery; already committed wardrobe action remained intact.
- Retry added only three delivery events. Duplicate-trigger replay added no events or deliveries.
- The complete execution and event projection survived reload.
- Desktop and 390 px layouts had no horizontal document overflow.
- Browser console contained no warnings or errors.
- Reset removed both workflow and domain state; WearCast returned to `Awaiting Trigger`.

## Honest local-mode boundary

The screen labels `manual-kampala-forecast-v1` as a fixed fixture and explicitly says it is not live weather. `fake-in-app-notification-v1` simulates an idempotent delivery adapter. The buttons are transparent demo-time scheduler triggers, not a claim that browser JavaScript is production background infrastructure.

The pure policies, checkpoint model, event commands, and ports are production-shaped. Phase 5 supplies Google Cloud repositories, scheduling, messaging, secrets, and deployment without moving decision logic into React.

## Reliability basis

The failure model follows official Google Cloud guidance recorded in `docs/phase-4-spec.md`: Cloud Tasks can execute a task more than once, Pub/Sub defaults to at-least-once delivery, and Workflows distinguishes retries for idempotent versus non-idempotent operations. Yange therefore treats duplicate delivery as normal input rather than an exceptional accident.
