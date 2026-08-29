# Yange architecture

## Central idea

Yange maintains a live Wardrobe Digital Twin. The current view is reconstructed from an append-only event ledger, making decisions reproducible, observable, and safe to replay.

## Architectural laws

1. AI proposes; validated domain rules commit.
2. Every autonomous action is observable, reversible, and idempotent.
3. Long-running workflows resume from checkpoints.
4. Integration failures are isolated behind adapters.
5. New capabilities subscribe to domain events instead of rewriting the core.

## Local-to-cloud boundary

The domain owns no network or framework code. It exposes commands, events, projections, scores, and policies. Interfaces supply persistence, multimodal analysis, weather, calendar, notifications, and time.

```mermaid
flowchart LR
  Browser["Responsive web + Cloud Proof"] --> Edge["Public Cloud Run edge"]
  Edge -->|"signed intents"| Storage["Private Cloud Storage"]
  Edge -->|"stable task + OIDC"| Tasks["Cloud Tasks"]
  Scheduler["Cloud Scheduler"] -->|"OIDC sweep"| Worker["Private Cloud Run worker"]
  Tasks -->|"OIDC"| Worker
  Steward["Private Google ADK + Gemini 3.5 Flash"] -->|"two approved tools + OIDC"| Worker
  Worker --> Domain["Deterministic domain engine"]
  Domain --> Firestore["Firestore ledger + projection + workflow + outbox"]
  Worker --> Weather["Google Weather"]
  Worker --> Calendar["Google Calendar, read-only"]
  Worker --> PubSub["Pub/Sub ordered events + DLQ"]
  Vertex["Vertex AI structured multimodal/explanations"] --> Contracts["Versioned runtime contracts"]
  Edge -->|"opt-in Mirror task"| MirrorTasks["Rate-limited Mirror queue"]
  MirrorTasks --> Worker
  Worker -->|"adult-only, one output"| VTO["Google Virtual Try-On 001"]
  VTO -->|"private temporary result"| Storage
  Contracts --> Domain
```

Package ownership is explicit:

- `@yange/domain`: deterministic policies, commands, events, projections, simulation, and scores.
- `@yange/contracts`: versioned integration ports, runtime validation, and credential-free local adapters.
- `@yange/orchestrator`: checkpointed workflow sequencing, retry, resume, and duplicate-trigger handling.
- `@yange/web`: responsive presentation plus browser-backed repository implementations.
- `@yange/cloud`: Firestore, Storage, Tasks, Pub/Sub, Weather, Calendar, Vertex AI, configuration, and observability adapters.
- `@yange/api`: role-separated edge/worker HTTP boundary, session isolation, readiness, security headers, and static delivery.
- `services/yange_steward`: Google ADK reasoning service with narrow workload-identity tools.

## Implemented event flows

### Phase 1 — wear and confidence

```text
User marks outfit worn
        |
Command validates outfit state
        |
Deterministic wear policies emit garment transition events
        |
Event ledger persists atomically
        |
Projection replay updates availability and readiness
        |
Activity timeline renders the same committed evidence
        |
Confidence Check-in updates contextual preference memory
```

### Phase 2 — multimodal evidence intake

```text
User selects garment / care-label / inspiration image
        |
Browser validates extension + MIME + binary signature
        |
Decode -> orient -> resize -> WebP rewrite (metadata removed)
        |
IndexedDB stores Blob -------- ledger stores opaque asset ID only
        |
Versioned multimodal port -> deterministic local adapter
        |
Runtime contract parser rejects unsafe or malformed output
        |
User reviews and corrects field-level evidence
        |
Domain command validates provenance -> append-only event -> replayed twin
```

### Phase 3 — auditable outfit planning

```text
Manual weather port + manual calendar port
        |
Validated, timestamped planning-context snapshot
        |
Pure constraint generator rejects unavailable dependencies
        |
Five deterministic factors -> Personal Match receipt
        |
Explanation-only adapter describes the completed result
        |
User selects candidate -> validated idempotent command
        |
OutfitPlanned + dependency reservation events -> replayed twin
```

The model boundary is downstream of the decision. Runtime parsing rejects responses that contain garment selection, state changes, actions, events, or a replacement score. An explanation outage therefore degrades prose only; ranked candidates, factor evidence, and planning remain operational.

### Phase 3 — laundry safety graph

```text
Explicitly queued laundry garments
        |
Unknown / unreviewed care evidence -> fail-closed holdouts
        |
Confirmed care constraints -> incompatibility edges
        |
Stable graph colouring -> independent wash clusters
        |
Strictest bleach rule + per-garment drying routes
        |
Visible cluster evidence and separation trace
```

The clustering engine is pure TypeScript and deliberately conservative: extra loads are allowed; an incompatibility edge inside a recommended load is not.

### Phase 4 — autonomous WearCast

```text
Scheduler-shaped trigger with stable trigger ID
        |
Validated seven-day ForecastProvider snapshot
        |
Clone Digital Twin -> simulate Do nothing + Autopilot
        |
Risk policy -> drying opportunity -> verified fallback
        |
Validated idempotent domain commit
        |
Autonomy run + laundry windows + fallback + notification outbox events
        |
NotificationGateway delivery -> delivered events
```

The workflow stores six checkpoints in a repository independent of the event ledger. Forecast acquisition and branch simulation are read-only. The intervention commit is atomic at the local event-sink boundary. Notification delivery follows as its own checkpoint, so a gateway outage cannot erase or duplicate a valid wardrobe decision.

```text
triggered
   -> forecast-acquired
   -> decision-simulated
   -> interventions-committed
   -> notifications-delivered
   -> completed
```

Retry loads the existing execution and skips every reached checkpoint. A completed trigger replay returns the saved receipt and increments `duplicateTriggerCount`; it does not call the event sink or notification gateway. Per-notification checkpoint state and stable idempotency keys also protect partial delivery loops.

The browser keeps an optimistic `localStorage` mirror so taps remain immediate and the free local product works offline. When an API base URL is configured (or the app is served by Cloud Run), each mutation is sent as a typed command—not a trusted event—to the authenticated API session. The API rebuilds the user's current twin, re-runs domain validation, and appends the resulting idempotent events through Firestore's transaction and outbox. On startup, an existing cloud ledger hydrates the browser mirror.

### Phase 5 — production Google Cloud boundary

```text
public request -> edge validation/session -> stable Cloud Task
                                           |
                                           v
private worker -> read projection -> Google Weather -> WearCast policy
       |                                      |
       +-> Firestore transaction <------------+
              event + projection + outbox
                           |
                           v
                  Pub/Sub publish / retry sweep
```

The deployed Node container is role-shaped at runtime. The edge returns 404 for internal routes; the worker returns 404 for public routes. Cloud Run IAM is the primary internal authentication boundary, and the worker trusts `X-Yange-User` only after the platform has admitted the OIDC-authenticated caller. Stable Cloud Task names and workflow trigger IDs make duplicate transport delivery non-catastrophic.

The separate ADK service reasons with Gemini and can inspect or request a verified WearCast run. It has no Firestore or Storage dependency and cannot mutate state. Its worker calls carry Google-issued identity tokens; the worker independently revalidates every action.

Firestore stores four evidence surfaces under each opaque user partition: immutable events, a rebuildable current projection, checkpoint receipts, and outbox records. An append transaction either writes all matching evidence or none of it. Pub/Sub delivery is downstream, so transport failure cannot roll back a valid wardrobe decision.

### Yange Mirror, isolated presentation workflow

Mirror begins only after the user reserves a deterministically validated outfit. It is presentation output, not wardrobe evidence.

```text
Reserved outfit + photographed supported garment
        |
Explicit adult, image-rights, and regional-processing consent
        |
Short-lived signed upload for one person photo
        |
Edge revalidates outfit, garment ownership, photo reference, quota, and cache
        |
Stable Cloud Task name -> private worker
        |
Adult-only Google Virtual Try-On request, one output
        |
Person photo deleted -> result stored under 24-hour temporary lifecycle
        |
Polling receipt / optional browser notification / user delete
```

The job ledger is separate from the append-only Wardrobe Digital Twin. A blocked, failed, deleted, or duplicated Mirror job cannot emit domain events, change a score, reserve a garment, update Style Aura, or affect WearCast. The worker permits at most three transport attempts, while the edge permits four user-started generations per UTC day. Inputs and outputs remain in private Cloud Storage; task payloads and logs contain identifiers only. See [Yange Mirror safety and experiment record](yange-mirror.md).

### Replaceable model boundary

`@yange/contracts` owns the versioned multimodal and explanation requests, responses, runtime parsers, and adapter ports. The React experience depends on those boundaries rather than a Gemini SDK. Phase 5 can add Vertex AI adapters without changing domain commands, persisted events, scoring, or review UI.

### Local split persistence

- `localStorage`: the small append-only domain event ledger.
- `IndexedDB`: rewritten image blobs and media metadata.
- Domain events reference generated asset IDs and never carry pixels or original files.
- Reset clears both stores; a media-storage failure does not erase a successfully reset ledger.

## Reliability decisions

- Commands include operation IDs for idempotency.
- Invalid transitions emit nothing and return a domain error.
- Event projection is deterministic and can be rebuilt.
- External data is timestamped and carries freshness/confidence metadata.
- Model-produced structured data is versioned and validated before use.
- Confirmed user and care-label facts outrank AI estimates.
- Critical operations never depend on a WebGL or animation layer.
- Future simulation clones its inputs and cannot write the event ledger.
- Forecast heuristics express suitability and uncertainty, never a guaranteed drying completion time.
- Workflow retries are idempotent even when the underlying scheduler or message transport delivers more than once.
- Generative presentation is isolated from decision authority and can fail without changing the twin.

## Phase 6 — presentation and proof boundary

Style Aura is deliberately downstream of product state. A pure palette function reads explicit colour preferences, confirmed inspiration palettes, exact positive and negative garment-colour evidence, broader confidence signals, and confirmed garment colours. Whole-outfit ratings receive deliberately weak attribution; “Colours felt right/off” creates stronger user-attributed evidence. Aggregates use recency decay, evidence thresholds, explainable counts, and certainty. A persisted display projection advances no more than 8% toward a new target for each changed evidence signature, while the WebGL renderer interpolates that step over 2.8 seconds. It receives only four colour targets plus energy/warmth settings and has no command authority.

```mermaid
flowchart LR
  Events["Append-only events"] --> Twin["Replayed TwinState"]
  Twin --> Product["Functional React surfaces"]
  Twin --> Palette["Pure Style Aura palette"]
  Palette --> WebGL["Disposable WebGL canvas"]
  WebGL -->|"context loss"| Still["Static accessible fallback"]
  Product --> Commands["Validated commands"]
  Commands --> Events
```

The renderer clears and redraws every frame; it does not accumulate state in a framebuffer. Sustained frame pressure reduces only its drawing-buffer scale. A hidden tab pauses it, reduced-motion freezes it, and a lost context replaces it with a still composition while every product control remains mounted.

Judge Mode is another read-only proof surface. Its six lights derive from committed media references, Look DNA, an agent-planned outfit, Confidence Check-in memory, WearCast risk projection, and workflow completion. It can navigate to the feature that creates each proof, reset the deterministic demo repositories, or disconnect the disposable renderer. It cannot directly mark a proof complete.

For the presentation-ready diagram, see [Yange production architecture](assets/yange-architecture.svg).
