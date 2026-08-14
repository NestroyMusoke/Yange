# Yange

Yange is the wardrobe agent that learns what confidence looks like on you. Its name draws from the Luganda possessive *yange*—“my”—because the experience is built around my wardrobe, my preferences, and my confidence. Yange maintains a live Wardrobe Digital Twin, plans with real garment availability, and turns wear history into safer laundry and more personal outfit decisions.

## Phase 1

The first vertical slice runs entirely locally and requires no cloud credentials. It includes:

- A responsive mobile-first product shell
- An event-driven Wardrobe Digital Twin
- Material-aware post-wear garment transitions
- Wardrobe readiness calculation
- Confidence Check-ins and preference-memory updates
- A user-visible Agent Activity audit trail
- Local persistence through a replaceable repository adapter
- Domain tests and a production build

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

AI may propose actions; validated domain rules commit state. The Phase 1 domain package intentionally has no React, browser, Gemini, or Google Cloud dependencies so it can later run behind Cloud Run without being rewritten.

See [docs/build-plan.md](docs/build-plan.md) and [docs/architecture.md](docs/architecture.md).
