# Yange

Yange is the wardrobe agent that learns what confidence looks like on you. Its name draws from the Luganda possessive *yange*—“my”—because the experience is built around my wardrobe, my preferences, and my confidence. Yange maintains a live Wardrobe Digital Twin, plans with real garment availability, and turns wear history into safer laundry and more personal outfit decisions.

## Current build — Phase 2

The first two vertical slices run entirely locally and require no cloud credentials. The build now includes:

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
- Contract, domain, and browser image-pipeline tests

The local model simulation is intentional. It makes every Phase 2 workflow reproducible for contributors and judges; a future Vertex AI adapter implements the same `@yange/contracts` interface.

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

See [docs/build-plan.md](docs/build-plan.md), [docs/architecture.md](docs/architecture.md), [docs/phase-2-spec.md](docs/phase-2-spec.md), and [docs/phase-2-verification.md](docs/phase-2-verification.md).
