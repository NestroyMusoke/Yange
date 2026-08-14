# Yange

Yange is the wardrobe agent that learns what confidence looks like on you. Its name draws from the Luganda possessive *yange*—“my”—because the experience is built around my wardrobe, my preferences, and my confidence. Yange maintains a live Wardrobe Digital Twin, plans with real garment availability, and turns wear history into safer laundry and more personal outfit decisions.

## Current build — Phase 4

The first four vertical slices run entirely locally and require no cloud credentials. The build now includes:

- A responsive mobile-first product shell
- An event-driven Wardrobe Digital Twin
- Material-aware post-wear garment transitions
- Wardrobe readiness calculation
- Confidence Check-ins and preference-memory updates
- A user-visible Agent Activity audit trail
- Local persistence through a replaceable repository adapter
- Garment and optional care-label image capture
- On-device signature validation, resize, WebP rewrite, and private IndexedDB storage
- Field-level evidence provenance and explicit care review
- User-controlled height, colour, fit, comfort, and Style DNA preferences
- Inspiration-image Look DNA for Pinterest images or saved social-video frames
- A versioned multimodal port with a deterministic local Gemini simulation
- Deliberate failure injection and retry without reselecting an image
- An Outfit Atelier that generates only feasible looks from live garment state
- A deterministic, five-factor Personal Match receipt with stable tie-breaking
- Replaceable weather and calendar context adapters
- An explanation-only model contract that cannot choose garments, score, or mutate state
- Atomic outfit planning and dependency reservation events
- A conservative Laundry Lab with incompatibility-graph clustering
- Separate drying routes, visible conflict edges, and fail-closed care holdouts
- A seven-day WearCast horizon with validated production-shaped forecast data
- Non-destructive `Do nothing` versus `Autopilot` future branches
- A transparent 50% core-wardrobe pressure policy
- Conservative drying-opportunity ranking without false exact-time promises
- Autonomous fallback planning through the existing deterministic outfit engine
- A dedicated `@yange/orchestrator` package with six durable checkpoints
- Notification outbox delivery that resumes after failure
- Stable trigger and notification idempotency keys with visible duplicate suppression
- Contract, domain, and browser image-pipeline tests

The local model simulations are intentional. They make the complete workflow reproducible for contributors and judges; future Vertex AI adapters implement the same `@yange/contracts` interfaces.

## Run locally

```powershell
npm.cmd install
npm.cmd run dev
```

Then open the local URL printed by the development server.

## Verify

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

## Architecture rule

AI may propose actions; validated domain rules commit state. The domain package has no React, browser, Gemini, or Google Cloud dependencies. Images live in a media repository while events store opaque asset IDs, so the domain can later run behind Cloud Run without being rewritten.

See [docs/build-plan.md](docs/build-plan.md), [docs/architecture.md](docs/architecture.md), [docs/phase-4-spec.md](docs/phase-4-spec.md), and [docs/phase-4-verification.md](docs/phase-4-verification.md).
