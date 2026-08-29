# Yange submission checklist

No credential, token, service-account file, Terraform state, private photo, or personal calendar data belongs in the repository or submission screenshots.

## Innovation & operational utility — 40%

- [ ] The video shows a garment being marked worn and material-aware state transitions.
- [ ] The agent detects a future outfit dependency without another user prompt.
- [ ] The 50% core-wardrobe threshold is visible and explained as a policy, not a magic number.
- [ ] Weather influences a conservative wash/dry opportunity.
- [ ] Laundry is separated by care compatibility with uncertain items held out.
- [ ] Do nothing and Autopilot futures are compared before commit.
- [ ] The agent schedules, notifies, and reserves a fallback with little hand-holding.
- [ ] Personal Match and Style Aura use user-controlled evidence rather than attractiveness claims.
- [ ] If Mirror is shown, it starts only after reservation and is described as an optional single-garment visualization, not 3D or a fit prediction.
- [ ] Shopping is described only as later intentional gap analysis, not part of the working MVP.

## Architectural discipline & stack — 30%

- [ ] The diagram shows web, edge, worker, domain, orchestration, persistence, integrations, and ADK boundaries.
- [ ] Explain “AI proposes; validated domain rules commit.”
- [ ] Show append-only events, rebuildable projection, durable checkpoints, transactional outbox, and idempotency keys.
- [ ] Show public edge versus private worker routes and least-privilege identities.
- [ ] Demonstrate notification failure/resume without duplicated committed action.
- [ ] Demonstrate Style Aura failure without product failure.
- [ ] Point to schema-constrained Vertex adapters and the narrow ADK tool surface.
- [ ] Confirm no secrets are in Git and readiness fails closed when required cloud configuration is absent.
- [ ] Show Mirror’s separate job ledger, stable task, adult-only request, per-user cost cap, temporary storage, and failure isolation.

## Demo & production readiness — 30%

- [ ] `scripts/verify-phase6.ps1` passes from a clean checkout.
- [ ] The repository README has local and Google setup commands.
- [ ] The demo video is one unedited take, under the event’s limit.
- [ ] Desktop and 390 px mobile frames have no page-level horizontal overflow.
- [ ] The deployed UI says **Google Cloud live**, not local rehearsal.
- [ ] Record the public URL: `____________________________`.
- [ ] Record edge revision: `____________________________`.
- [ ] Record worker revision: `____________________________`.
- [ ] Record ADK revision: `____________________________`.
- [ ] Record one successful workflow trace ID: `____________________________`.
- [ ] Record one idempotent replay receipt: `____________________________`.
- [ ] Capture Cloud Run, Firestore, Cloud Tasks/Scheduler, Pub/Sub/DLQ, Vertex AI, and ADK evidence.
- [ ] Confirm the final screenshots contain no token, email, billing identifier, or private calendar title.
- [ ] Pause or scale down cloud resources after evidence capture.

## Honest claim language

Use:

- “deterministic local Gemini simulation” for credential-free local mode;
- “Vertex AI Gemini” only when the deployed adapter is active;
- “saved social-video frame” rather than direct TikTok ingestion;
- “drying suitability window” rather than guaranteed dry time; and
- “Personal Match” rather than a beauty, body, or attractiveness score.
- “AI visualization, not a fit guarantee” rather than 3D try-on, exact fit, or sizing advice.
