# Yange phased build plan

## Build strategy

Each phase must produce a runnable, verifiable increment. Google integrations are accessed through ports/adapters so development can use local implementations and the final credential-connection step only supplies configuration and secrets.

## Phase 1 — Wardrobe Digital Twin vertical slice

**Status:** Complete and verified.

**Goal:** Prove the central state-and-learning loop without external services.

Deliverables:

- Monorepo foundation with a pure TypeScript domain package and React web app
- Seeded wardrobe, planned outfit, and Style DNA profile
- Append-only domain event ledger with deterministic projection
- `Mark as worn` flow that classifies items as laundry, rewearable, airing, or available
- Derived Wardrobe Readiness score and at-risk outfit detection
- Five-level Confidence Check-in and contextual preference-memory update
- Agent Activity timeline derived from domain events
- Local repository adapter with browser persistence
- Domain tests, type checking, and production build

Exit criteria:

- Refreshing the page preserves the event ledger
- Replaying the same ledger produces the same Wardrobe Digital Twin
- An outfit cannot be marked worn twice
- Confidence feedback cannot be recorded before the outfit is worn
- Domain tests and production build pass

## Phase 2 — Multimodal wardrobe and Style DNA onboarding

**Status:** Complete and verified locally. Google credentials are intentionally not required.

**Goal:** Replace seeded wardrobe inputs with beautiful user-controlled onboarding.

Deliverables:

- Garment photo and care-label capture
- Local image compression, preview, retry, and upload queue
- Versioned multimodal extraction contract
- Fake Gemini adapter for deterministic local development
- Editable garment, material, care, colour, height, comfort, and style fields
- Provenance labels: user-confirmed, label-extracted, or AI-estimated
- Inspiration-image Look DNA flow

Exit criteria:

- A user can create and correct a wardrobe item without cloud credentials
- Uncertain care information never becomes confirmed automatically
- Multimodal adapter can later be switched to Vertex AI through configuration

Verification evidence:

- Runtime validation rejects malformed or falsely auto-confirmed model output
- Deliberate adapter failure preserves prepared images and retries successfully
- Care-label facts cannot be committed as confirmed without an explicit user action
- Garment media, Style DNA, and Look DNA survive reload
- Browser console is clean and 390 px / desktop layouts have no horizontal overflow
- See `docs/phase-2-verification.md` for the reproducible checklist

## Phase 3 — Outfit intelligence and safe laundry planning

**Status:** Complete and verified locally. Google credentials are intentionally not required.

**Goal:** Generate explainable personalised looks and material-safe laundry clusters.

Deliverables:

- Constraint-based outfit candidate generator
- Deterministic Personal Match scoring
- Gemini explanation adapter with structured responses
- Laundry incompatibility graph and safe cluster solver
- Event reservations and outfit dependencies
- Manual weather/calendar adapters plus contract tests

Exit criteria:

- Scores can be reproduced from stored inputs
- A language-model response cannot directly mutate garment state
- Confirmed incompatible care instructions never share a recommended load

Verification evidence:

- Identical state and context produce identical candidate IDs, rankings, and factor receipts
- Laundry, drying, airing, and reserved pieces are excluded before scoring
- Injected explanation failure leaves every deterministic candidate and score usable
- Four staged laundry pieces form three conflict-free loads with five visible separation edges
- Planning persists one outfit event and one reservation event per dependency across reload
- All 27 automated tests, strict type checking, production build, high-severity dependency audit, desktop walkthrough, and 390 px responsive checks pass
- See `docs/phase-3-verification.md` for the reproducible record

## Phase 4 — Autonomous WearCast and Laundry Window Optimizer

**Goal:** Prove asynchronous, high-value action.

Deliverables:

- Seven-day Wardrobe Forecast
- Non-destructive future simulation branches
- `Do nothing` versus `Autopilot` comparison
- Forecast-aware washing and drying windows
- Background event triggers, checkpointed workflows, retries, and idempotency
- In-app notifications and safe replanning
- Transparent demo-time controls

Exit criteria:

- A future outfit conflict is detected without a chat request
- The agent schedules an intervention and reserves a fallback
- Duplicate events do not duplicate notifications or state transitions
- A failed integration degrades one capability without breaking the app

## Phase 5 — Google Cloud adapters and production hardening

**Goal:** Connect the finished local system to the required hackathon stack.

Deliverables:

- Gemini 3.5 Flash through Vertex AI
- Google ADK orchestration on Cloud Run
- Firestore current projections, event ledger, and transactional outbox
- Cloud Storage private media and signed access
- Pub/Sub, Cloud Tasks/Scheduler, retry policy, and dead-letter handling
- Secret Manager, least-privilege service accounts, structured logs, and traces
- Google Calendar and weather adapters where enabled

Credential step:

- Create/select the Google Cloud project
- Enable required APIs
- Add secrets and OAuth configuration
- Deploy and run integration tests

No application source should require credentials to compile or run in local mode.

## Phase 6 — Style Aura, performance, demo, and submission readiness

**Goal:** Produce the memorable visual signature and undeniable judging proof.

Deliverables:

- Isolated WebGL Style Aura driven by learned palette evidence
- Reduced-motion and non-WebGL fallbacks
- Adaptive rendering quality and foreground legibility protection
- Complete four-minute demo scenario
- Failure-injection demonstration
- Architecture diagram, screenshots, seeded judge mode, README, and deployment proof

Exit criteria:

- Style Aura failure cannot affect product functionality
- Responsive experience passes phone and desktop checks
- A fresh clone has reproducible setup instructions
- Live demo proves autonomous action and Google Cloud execution

## Commit cadence

Use one commit per verified phase. Within larger phases, optional checkpoints can be made after domain, interface, and integration milestones. Never commit credentials.
